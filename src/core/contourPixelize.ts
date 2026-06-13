import { contrastDownscale } from './downscale'
import { PixelImageData } from './imageData'
import { labToRgb255, rgbaToLabPlanes } from './planes'

/**
 * Contour re-rasterization downscale (experimental).
 *
 * Statistical representative-color selection (greedy heuristic or MRF
 * labeling) decides each output pixel independently and never *draws* —
 * hard, fluent line work can only emerge by accident. Pixel artists work
 * the other way around: lay down flat color regions, then REDRAW outlines
 * pixel by pixel following "pixel-perfect" rules.
 *
 * This implements that workflow:
 *  1. Base layer: the greedy contrast downscale — its smooth region look
 *     is good; only its dropped thin structures need rescuing.
 *  2. Stroke extraction at full resolution: pixels significantly darker
 *     (brighter) than their local median are stroke pixels.
 *  3. Project stroke coverage + color onto the output grid.
 *  4. Thin the coarse stroke mask to 1px width (Zhang-Suen) and remove
 *     pixel-art "doubles" (L-shaped stair corners) — lines are crisp and
 *     fluent BY CONSTRUCTION, not statistically recovered.
 *  5. Composite strokes over the base.
 */

export interface ContourDownscaleOptions {
  /** Stroke detection threshold: L-units below/above the local median. */
  strokeTau?: number
  /** Local median window radius in source pixels (default: patch size). */
  medianRadius?: number
  /** Minimum stroke coverage of an output cell to enter the coarse mask. */
  covThreshold?: number
  /** Also extract bright strokes (highlights). */
  brightStrokes?: boolean
  /** Minimum skeleton fragment length (output cells); shorter ones are noise. */
  minStroke?: number
}

/**
 * Box-filtered local median approximation: a true sliding median is
 * expensive; for stroke detection a separable percentile approximation is
 * enough. We use a 2-pass box mean of the CLIPPED plane (median-of-means
 * style): strokes are thin, so a wide box mean is dominated by background —
 * close enough to a local median for thresholding purposes.
 */
function boxBackground(l: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  // horizontal pass
  for (let y = 0; y < h; y++) {
    const row = y * w
    let acc = 0
    let cnt = 0
    for (let x = 0; x < Math.min(w, radius + 1); x++) {
      acc += l[row + x]
      cnt++
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / cnt
      const add = x + radius + 1
      const del = x - radius
      if (add < w) {
        acc += l[row + add]
        cnt++
      }
      if (del >= 0) {
        acc -= l[row + del]
        cnt--
      }
    }
  }
  // vertical pass
  for (let x = 0; x < w; x++) {
    let acc = 0
    let cnt = 0
    for (let y = 0; y < Math.min(h, radius + 1); y++) {
      acc += tmp[y * w + x]
      cnt++
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / cnt
      const add = y + radius + 1
      const del = y - radius
      if (add < h) {
        acc += tmp[add * w + x]
        cnt++
      }
      if (del >= 0) {
        acc -= tmp[del * w + x]
        cnt--
      }
    }
  }
  return out
}

/** Morphological closing (3x3) on a small binary grid — bridges 1-cell gaps
 * left by faint stroke segments before thinning. */
function close3(mask: Uint8Array, w: number, h: number): void {
  const dilated = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let dy = -1; dy <= 1 && !v; dy++) {
        for (let dx = -1; dx <= 1 && !v; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx] === 1) {
            v = 1
          }
        }
      }
      dilated[y * w + x] = v
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1
      for (let dy = -1; dy <= 1 && v; dy++) {
        for (let dx = -1; dx <= 1 && v; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && dilated[ny * w + nx] === 0) {
            v = 0
          }
        }
      }
      mask[y * w + x] = v
    }
  }
}

/** Zhang-Suen thinning on a small binary grid (modifies mask in place). */
function thinZhangSuen(mask: Uint8Array, w: number, h: number): void {
  const at = (x: number, y: number): number =>
    (x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1) ? 1 : 0
  const toClear: number[] = []
  let changed = true
  while (changed) {
    changed = false
    for (let phase = 0; phase < 2; phase++) {
      toClear.length = 0
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (mask[y * w + x] !== 1) {
            continue
          }
          const p2 = at(x, y - 1)
          const p3 = at(x + 1, y - 1)
          const p4 = at(x + 1, y)
          const p5 = at(x + 1, y + 1)
          const p6 = at(x, y + 1)
          const p7 = at(x - 1, y + 1)
          const p8 = at(x - 1, y)
          const p9 = at(x - 1, y - 1)
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) {
            continue
          }
          const seq = [
            p2,
            p3,
            p4,
            p5,
            p6,
            p7,
            p8,
            p9,
            p2,
          ]
          let a = 0
          for (let i = 0; i < 8; i++) {
            if (seq[i] === 0 && seq[i + 1] === 1) {
              a++
            }
          }
          if (a !== 1) {
            continue
          }
          const c1 = phase === 0 ? p2 * p4 * p6 : p2 * p4 * p8
          const c2 = phase === 0 ? p4 * p6 * p8 : p2 * p6 * p8
          if (c1 === 0 && c2 === 0) {
            toClear.push(y * w + x)
          }
        }
      }
      if (toClear.length > 0) {
        changed = true
        for (const idx of toClear) {
          mask[idx] = 0
        }
      }
    }
  }
}

/**
 * Remove skeleton fragments shorter than `minSize` (8-connected) and prune
 * 1-pixel spurs — stray stubs from texture survive thinning as 2-3 cell
 * worms; real contours are long.
 */
function pruneSkeleton(mask: Uint8Array, w: number, h: number, minSize: number): void {
  const at = (x: number, y: number): number =>
    (x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1) ? 1 : 0
  // 1-px spur removal: endpoints (exactly one 8-neighbor) adjacent to a
  // pixel with 3+ neighbors (junction) are stubs, not line ends.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) {
        continue
      }
      let nb = 0
      let nx = -1
      let ny = -1
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx !== 0 || dy !== 0) && at(x + dx, y + dy)) {
            nb++
            nx = x + dx
            ny = y + dy
          }
        }
      }
      if (nb === 1) {
        let jn = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx !== 0 || dy !== 0) && at(nx + dx, ny + dy)) {
              jn++
            }
          }
        }
        if (jn >= 3) {
          mask[y * w + x] = 0
        }
      }
    }
  }
  // Small-component removal
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const comp: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (mask[i] !== 1 || seen[i]) {
      continue
    }
    comp.length = 0
    stack.push(i)
    seen[i] = 1
    while (stack.length > 0) {
      const c = stack.pop()!
      comp.push(c)
      const cx = c % w
      const cy = (c - cx) / w
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = cx + dx
          const py = cy + dy
          if (px >= 0 && py >= 0 && px < w && py < h) {
            const pc = py * w + px
            if (mask[pc] === 1 && !seen[pc]) {
              seen[pc] = 1
              stack.push(pc)
            }
          }
        }
      }
    }
    if (comp.length < minSize) {
      for (const c of comp) {
        mask[c] = 0
      }
    }
  }
}

/**
 * Pixel-perfect cleanup: remove "doubles" — the L-shaped corner pixel of a
 * staircase (orthogonal pixel that also has a diagonal neighbor on the same
 * path). Removing it keeps 8-connectivity and turns soft stairs into clean
 * diagonal steps. One pass is enough after thinning.
 */
function removeDoubles(mask: Uint8Array, w: number, h: number): void {
  const at = (x: number, y: number): number =>
    (x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1) ? 1 : 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) {
        continue
      }
      const n = at(x, y - 1)
      const s = at(x, y + 1)
      const e = at(x + 1, y)
      const wst = at(x - 1, y)
      const orth = n + s + e + wst
      if (orth !== 2) {
        continue
      }
      // L-corner: exactly two orthogonal neighbors forming a right angle,
      // and the diagonal between them is also set -> this pixel is a double.
      const corner
        = (n && e && at(x + 1, y - 1))
          || (e && s && at(x + 1, y + 1))
          || (s && wst && at(x - 1, y + 1))
          || (wst && n && at(x - 1, y - 1))
      if (corner) {
        mask[y * w + x] = 0
      }
    }
  }
}

export function contourDownscale(
  imageData: PixelImageData,
  targetSize: number = 128,
  options: ContourDownscaleOptions = {},
): PixelImageData {
  const { width: w, height: h } = imageData
  const ratio = w / h
  const adjustedTargetSize = Math.sqrt((targetSize * targetSize) / ratio)
  const outW = Math.max(1, Math.floor(adjustedTargetSize * ratio))
  const outH = Math.max(1, Math.floor(adjustedTargetSize))
  const patch = Math.max(1, Math.round(w / outW))

  const {
    strokeTau = 14,
    medianRadius = patch,
    covThreshold = 0.12,
    brightStrokes = true,
    minStroke = 4,
  } = options

  const { l, a, b } = rgbaToLabPlanes(imageData.data, w, h)
  const bg = boxBackground(l, w, h, medianRadius)

  // ---- Base layer: box average per output cell ---------------------------
  const nCells = outW * outH
  const baseL = new Float32Array(nCells)
  const baseA = new Float32Array(nCells)
  const baseB = new Float32Array(nCells)
  // Dark stroke accumulators
  const dCov = new Float32Array(nCells)
  const dL = new Float32Array(nCells)
  const dA = new Float32Array(nCells)
  const dB = new Float32Array(nCells)
  const dCovWeak = new Float32Array(nCells)
  const bCovWeak = new Float32Array(nCells)
  // Bright stroke accumulators
  const bCov = new Float32Array(nCells)
  const bL = new Float32Array(nCells)
  const bA = new Float32Array(nCells)
  const bB = new Float32Array(nCells)

  for (let oy = 0; oy < outH; oy++) {
    const y0 = Math.floor(oy * h / outH)
    const y1 = Math.max(y0 + 1, Math.floor((oy + 1) * h / outH))
    for (let ox = 0; ox < outW; ox++) {
      const x0 = Math.floor(ox * w / outW)
      const x1 = Math.max(x0 + 1, Math.floor((ox + 1) * w / outW))
      const cell = oy * outW + ox

      let n = 0
      let sl = 0
      let sa = 0
      let sb = 0
      let dn = 0
      let bn = 0
      let dwn = 0
      let bwn = 0
      // Stroke color = the single most stroke-like pixel (max response), NOT
      // a mean: averaging mixes in anti-aliased transition pixels and washes
      // the line out to gray.
      let bestDark = -Infinity
      let bestBright = -Infinity
      for (let y = y0; y < y1; y++) {
        const row = y * w
        for (let x = x0; x < x1; x++) {
          const idx = row + x
          const lv = l[idx]
          n++
          sl += lv
          sa += a[idx]
          sb += b[idx]
          const resp = bg[idx] - lv
          if (resp > strokeTau) {
            dn++
          }
          else if (-resp > strokeTau) {
            bn++
          }
          if (resp > strokeTau / 2) {
            dwn++
            if (resp > bestDark) {
              bestDark = resp
              dL[cell] = lv
              dA[cell] = a[idx]
              dB[cell] = b[idx]
            }
          }
          else if (-resp > strokeTau / 2) {
            bwn++
            if (-resp > bestBright) {
              bestBright = -resp
              bL[cell] = lv
              bA[cell] = a[idx]
              bB[cell] = b[idx]
            }
          }
        }
      }
      baseL[cell] = sl / n
      baseA[cell] = sa / n
      baseB[cell] = sb / n
      dCov[cell] = dn / n
      dCovWeak[cell] = dwn / n
      bCov[cell] = bn / n
      bCovWeak[cell] = bwn / n
    }
  }

  // ---- Stroke masks: threshold -> thin -> pixel-perfect cleanup ----------
  // Hysteresis: strong-response cells seed the mask; weak-response cells
  // join only when 8-connected to a seed (faint stroke segments continue,
  // isolated weak responses — noise, grain — never ignite).
  const hysteresisMask = (cov: Float32Array, covWeak: Float32Array): Uint8Array => {
    const mask = new Uint8Array(nCells)
    const stack: number[] = []
    for (let c = 0; c < nCells; c++) {
      if (cov[c] > covThreshold) {
        mask[c] = 1
        stack.push(c)
      }
    }
    while (stack.length > 0) {
      const c = stack.pop()!
      const cx = c % outW
      const cy = (c - cx) / outW
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= outW || ny >= outH) {
            continue
          }
          const nc = ny * outW + nx
          if (mask[nc] === 0 && covWeak[nc] > covThreshold) {
            mask[nc] = 1
            stack.push(nc)
          }
        }
      }
    }
    return mask
  }
  const darkMask = hysteresisMask(dCov, dCovWeak)
  const brightMask = brightStrokes ? hysteresisMask(bCov, bCovWeak) : new Uint8Array(nCells)
  close3(darkMask, outW, outH)
  thinZhangSuen(darkMask, outW, outH)
  removeDoubles(darkMask, outW, outH)
  pruneSkeleton(darkMask, outW, outH, minStroke)
  if (brightStrokes) {
    close3(brightMask, outW, outH)
    thinZhangSuen(brightMask, outW, outH)
    removeDoubles(brightMask, outW, outH)
    pruneSkeleton(brightMask, outW, outH, minStroke)
  }

  // ---- Composite: greedy base + redrawn strokes ---------------------------
  const result = contrastDownscale(imageData, targetSize)
  const out = result.data
  for (let c = 0; c < nCells; c++) {
    let L = Number.NaN
    let A = 0
    let B = 0
    if (darkMask[c] === 1) {
      L = dL[c]
      A = dA[c]
      B = dB[c]
    }
    else if (brightMask[c] === 1) {
      L = bL[c]
      A = bA[c]
      B = bB[c]
    }
    if (!Number.isNaN(L)) {
      const [
        r,
        g,
        bRgb,
      ] = labToRgb255(L, A, B)
      out[c * 4] = r
      out[c * 4 + 1] = g
      out[c * 4 + 2] = bRgb
      out[c * 4 + 3] = 255
    }
  }

  return result
}
