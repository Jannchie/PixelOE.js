import { PixelImageData } from './imageData'
import { labToRgb255, rgbaToLabPlanes } from './planes'

/**
 * MRF-based contrast downscale (experimental).
 *
 * Instead of choosing each output pixel's representative L independently
 * (greedy min/max/center heuristic in `contrastDownscale`), this models the
 * choice as a labeling problem on the patch grid:
 *
 *  - Labels: CENTER (faithful), MIN (keep dark detail), MAX (keep bright detail)
 *  - Unary cost: prefers MIN/MAX only where the dark/bright detail is salient
 *    (contrast above `tau`, weighted by coverage so single noise pixels don't seed)
 *  - Pairwise cost: if a dark (bright) structure crosses the shared border of
 *    two adjacent patches, disagreeing on "represents the dark (bright)
 *    structure" is penalized — this propagates MIN/MAX along thin lines whose
 *    local salience dips below the unary threshold, fixing broken lines.
 *
 * Solved with ICM (few sweeps over a small grid), so the cost is negligible
 * compared with the per-patch statistics gathering.
 */

const LABEL_CENTER = 0
const LABEL_MIN = 1
const LABEL_MAX = 2

export interface MRFDownscaleOptions {
  /** Salience threshold (L units, 0-100) for unary MIN/MAX preference. */
  tau?: number
  /** Pairwise continuity weight. 0 disables the pairwise term (unary-only). */
  lambda?: number
  /** Minimum link strength (L units): weaker crossings are ignored entirely. */
  linkGate?: number
  /**
   * Rescue mode: keep the greedy heuristic's labels as the base (its smooth
   * contour look survives), and apply MRF labels only where the heuristic
   * chose CENTER — i.e. MRF may only RESCUE structure the heuristic dropped,
   * never override a choice it actively made.
   */
  rescue?: boolean
  /**
   * Anti-aliasing mode: patches the structure merely clips (<~8% coverage)
   * render a blend toward their center color instead of the full extreme —
   * the manual pixel-art AA convention. Softer look, but binary line
   * connectivity is no longer guaranteed (corner-connector patches dilute).
   */
  aa?: boolean
}

interface PatchFeatures {
  minL: Float32Array
  maxL: Float32Array
  medL: Float32Array
  centerL: Float32Array
  medA: Float32Array
  medB: Float32Array
  darkCov: Float32Array
  brightCov: Float32Array
  meanL: Float32Array
  robustMinL: Float32Array // mean of the darkest ~12% — rendering value (absolute min is one noisy pixel)
  robustMaxL: Float32Array
  iqr: Float32Array // scaled q40-q60 spread of L — local activity, blind to thin (<40% coverage) structures
  // Patch grid geometry (source-pixel bounds per output cell)
  xStarts: Int32Array
  yStarts: Int32Array
}

/**
 * Aligned crossing evidence, computed directly on the full-resolution L
 * plane so that diagonal structures may continue into NEIGHBORING patches —
 * per-patch border arrays are blind beyond the patch's own row/column band.
 *
 * A crossing at border offset t must be dark:
 *  - on both outer rows/cols at ~t (one-sided ±1 tolerance for diagonals), and
 *  - at depth 2 on both sides within ±2 of t (a 45-degree line shifts 1 px
 *    per depth). Texture aligning by luck at the border almost never also
 *    aligns 2 deep, which is what keeps dense grain out of the links.
 *
 * `axis=0`: vertical border between columns X-1|X, offsets t0..t1 are rows.
 * `axis=1`: horizontal border between rows X-1|X, offsets t0..t1 are columns.
 */
function crossingDark(
  l: Float32Array,
  w: number,
  h: number,
  axis: 0 | 1,
  X: number,
  t0: number,
  t1: number,
): number {
  const tMax = axis === 0 ? h - 1 : w - 1
  const lateral = axis === 0 ? w : 1 // step along the border
  const inward = axis === 0 ? 1 : w // step across the border
  const lineA = (X - 1) * inward
  const lineB = X * inward
  const lineA2 = Math.max(0, X - 2) * inward
  const lineB2 = Math.min(axis === 0 ? w - 1 : h - 1, X + 1) * inward

  const at = (line: number, t: number): number => l[line + t * lateral]
  const winMin = (line: number, t: number, r: number): number => {
    let m = Infinity
    const lo = Math.max(0, t - r)
    const hi = Math.min(tMax, t + r)
    for (let tt = lo; tt <= hi; tt++) {
      const v = at(line, tt)
      if (v < m) {
        m = v
      }
    }
    return m
  }

  let best = Infinity
  for (let t = t0; t < t1; t++) {
    const outer = Math.min(
      Math.max(at(lineA, t), winMin(lineB, t, 1)),
      Math.max(winMin(lineA, t, 1), at(lineB, t)),
    )
    const inner = Math.max(winMin(lineA2, t, 2), winMin(lineB2, t, 2))
    const v = Math.max(outer, inner)
    if (v < best) {
      best = v
    }
  }
  return best
}

function crossingBright(
  l: Float32Array,
  w: number,
  h: number,
  axis: 0 | 1,
  X: number,
  t0: number,
  t1: number,
): number {
  const tMax = axis === 0 ? h - 1 : w - 1
  const lateral = axis === 0 ? w : 1
  const inward = axis === 0 ? 1 : w
  const lineA = (X - 1) * inward
  const lineB = X * inward
  const lineA2 = Math.max(0, X - 2) * inward
  const lineB2 = Math.min(axis === 0 ? w - 1 : h - 1, X + 1) * inward

  const at = (line: number, t: number): number => l[line + t * lateral]
  const winMax = (line: number, t: number, r: number): number => {
    let m = -Infinity
    const lo = Math.max(0, t - r)
    const hi = Math.min(tMax, t + r)
    for (let tt = lo; tt <= hi; tt++) {
      const v = at(line, tt)
      if (v > m) {
        m = v
      }
    }
    return m
  }

  let best = -Infinity
  for (let t = t0; t < t1; t++) {
    const outer = Math.max(
      Math.min(at(lineA, t), winMax(lineB, t, 1)),
      Math.min(winMax(lineA, t, 1), at(lineB, t)),
    )
    const inner = Math.min(winMax(lineA2, t, 2), winMax(lineB2, t, 2))
    const v = Math.min(outer, inner)
    if (v > best) {
      best = v
    }
  }
  return best
}

/**
 * Hard gate: crossings weaker than `threshold` are ignored entirely, stronger
 * ones keep their FULL magnitude. A linear floor subtraction would weaken
 * genuine faint lines as much as it suppresses texture; the gate separates
 * "faint but real line" (full relief) from "paper-grain texture" (zero).
 * The threshold is raised by the patches' IQR: salience is RELATIVE to local
 * activity — a 15-unit line on a clean background is structure, the same
 * 15 units inside dense texture is just texture. IQR is blind to thin
 * (<25% coverage) structures, so the line itself never inflates the gate.
 */
function gate(value: number, threshold: number): number {
  return value >= threshold ? value : 0
}

function medianInPlace(values: Float32Array, n: number): number {
  // Patches are small; a sort keeps this simple and is not the bottleneck here.
  const view = values.subarray(0, n)
  view.sort()
  const mid = n >> 1
  return n % 2 === 1 ? view[mid] : (view[mid - 1] + view[mid]) / 2
}

export function contrastDownscaleMRF(
  imageData: PixelImageData,
  targetSize: number = 128,
  options: MRFDownscaleOptions = {},
): PixelImageData {
  const { tau = 28, lambda = 2.5, linkGate = 12, aa = false, rescue = false } = options
  const { width: w, height: h } = imageData
  const ratio = w / h
  const adjustedTargetSize = Math.sqrt((targetSize * targetSize) / ratio)
  const outW = Math.max(1, Math.floor(adjustedTargetSize * ratio))
  const outH = Math.max(1, Math.floor(adjustedTargetSize))
  const nPatches = outW * outH

  const { l, a, b } = rgbaToLabPlanes(imageData.data, w, h)

  const f: PatchFeatures = {
    minL: new Float32Array(nPatches),
    maxL: new Float32Array(nPatches),
    medL: new Float32Array(nPatches),
    centerL: new Float32Array(nPatches),
    medA: new Float32Array(nPatches),
    medB: new Float32Array(nPatches),
    darkCov: new Float32Array(nPatches),
    brightCov: new Float32Array(nPatches),
    meanL: new Float32Array(nPatches),
    robustMinL: new Float32Array(nPatches),
    robustMaxL: new Float32Array(nPatches),
    iqr: new Float32Array(nPatches),
    actDark: new Float32Array(nPatches),
    actBright: new Float32Array(nPatches),
    xStarts: new Int32Array(outW + 1),
    yStarts: new Int32Array(outH + 1),
  }
  for (let ox = 0; ox <= outW; ox++) {
    f.xStarts[ox] = Math.min(w, Math.floor(ox * w / outW))
  }
  for (let oy = 0; oy <= outH; oy++) {
    f.yStarts[oy] = Math.min(h, Math.floor(oy * h / outH))
  }

  const maxPatch = (Math.ceil(w / outW) + 1) * (Math.ceil(h / outH) + 1)
  const lScratch = new Float32Array(maxPatch)
  const aScratch = new Float32Array(maxPatch)
  const bScratch = new Float32Array(maxPatch)

  // ---- Pass 1: per-patch features --------------------------------------
  for (let oy = 0; oy < outH; oy++) {
    const y0 = Math.floor(oy * h / outH)
    const y1 = Math.max(y0 + 1, Math.floor((oy + 1) * h / outH))
    for (let ox = 0; ox < outW; ox++) {
      const x0 = Math.floor(ox * w / outW)
      const x1 = Math.max(x0 + 1, Math.floor((ox + 1) * w / outW))
      const p = oy * outW + ox

      let n = 0
      let sumL = 0
      let minL = Infinity
      let maxL = -Infinity

      for (let y = y0; y < y1; y++) {
        const row = y * w
        for (let x = x0; x < x1; x++) {
          const idx = row + x
          const lv = l[idx]
          lScratch[n] = lv
          aScratch[n] = a[idx]
          bScratch[n] = b[idx]
          n++
          sumL += lv
          if (lv < minL) {
            minL = lv
          }
          if (lv > maxL) {
            maxL = lv
          }
        }
      }

      f.centerL[p] = lScratch[n >> 1]
      f.meanL[p] = sumL / n
      f.minL[p] = minL
      f.maxL[p] = maxL
      f.medA[p] = medianInPlace(aScratch, n)
      f.medB[p] = medianInPlace(bScratch, n)
      const medL = medianInPlace(lScratch, n) // sorts lScratch — centerL read above
      f.medL[p] = medL
      // lScratch[0..n) is now sorted: inner quantiles are free. Use the
      // narrow q40-q60 band so even a 2px line in a 5px patch (~36% coverage)
      // stays outside the band; x1.5 compensates for underestimating spread.
      const q40 = lScratch[Math.floor(n * 0.4)]
      const q60 = lScratch[Math.min(n - 1, Math.floor(n * 0.6))]
      f.iqr[p] = 3 * (q60 - q40)
      f.actDark[p] = 1.5 * (medL - q40)
      f.actBright[p] = 1.5 * (q60 - medL)

      // Coverage of pixels participating in the dark / bright structure
      const darkT = (minL + medL) / 2
      const brightT = (maxL + medL) / 2
      let darkCount = 0
      let brightCount = 0
      for (let i = 0; i < n; i++) {
        if (lScratch[i] < darkT) {
          darkCount++
        }
        if (lScratch[i] > brightT) {
          brightCount++
        }
      }
      f.darkCov[p] = darkCount / n
      f.brightCov[p] = brightCount / n

      // Robust extremes: average the darkest/brightest pixels instead of
      // taking the single most extreme (= noisiest) one. The average is
      // capped by the structure's own population so a 2-pixel corner clip
      // is not diluted with background pixels.
      const kDark = Math.max(1, Math.min(Math.round(n * 0.12), darkCount))
      const kBright = Math.max(1, Math.min(Math.round(n * 0.12), brightCount))
      let loSum = 0
      let hiSum = 0
      for (let i = 0; i < kDark; i++) {
        loSum += lScratch[i]
      }
      for (let i = 0; i < kBright; i++) {
        hiSum += lScratch[n - 1 - i]
      }
      f.robustMinL[p] = loSum / kDark
      f.robustMaxL[p] = hiSum / kBright
    }
  }

  // ---- Unary costs -------------------------------------------------------
  // Salience = contrast x coverage ramp (full weight once >= ~12% of the patch)
  const unary = new Float32Array(nPatches * 3)
  for (let p = 0; p < nPatches; p++) {
    const darkSal = (f.medL[p] - f.minL[p]) * Math.min(1, f.darkCov[p] * 8)
    const brightSal = (f.maxL[p] - f.medL[p]) * Math.min(1, f.brightCov[p] * 8)
    unary[p * 3 + LABEL_CENTER] = 0
    unary[p * 3 + LABEL_MIN] = tau - darkSal
    unary[p * 3 + LABEL_MAX] = tau - brightSal
  }

  // ---- Pairwise link strengths -------------------------------------------
  // linkDark(p,q): evidence that a dark structure crosses the shared border —
  // both border strips must contain a pixel well below both patch medians.
  // Horizontal links: p=(ox,oy) with q=(ox+1,oy), sides right(1)/left(0).
  // Vertical links: q=(ox,oy+1), sides bottom(3)/top(2).
  // Two evidence tiers (Canny-style hysteresis on the patch graph):
  //  - STRONG links pass the activity-raised gate (linkGate + local q40-q60
  //    spread): unambiguous structure even inside texture. They seed labels.
  //  - WEAK links only pass the base linkGate: genuine faint/tangent
  //    structure AND dense texture grain both land here. They may only
  //    EXTEND a label from an already-confirmed neighbor — texture has no
  //    seeds to extend from, so it never ignites.
  const hLinkDark = new Float32Array(nPatches)
  const hLinkBright = new Float32Array(nPatches)
  const vLinkDark = new Float32Array(nPatches)
  const vLinkBright = new Float32Array(nPatches)
  const hWeakDark = new Float32Array(nPatches)
  const hWeakBright = new Float32Array(nPatches)
  const vWeakDark = new Float32Array(nPatches)
  const vWeakBright = new Float32Array(nPatches)
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const p = oy * outW + ox
      const py0 = f.yStarts[oy]
      const py1 = f.yStarts[oy + 1]
      const px0 = f.xStarts[ox]
      const px1 = f.xStarts[ox + 1]
      if (ox + 1 < outW) {
        const q = p + 1
        const medMin = Math.min(f.medL[p], f.medL[q])
        const medMax = Math.max(f.medL[p], f.medL[q])
        const g = linkGate + Math.max(f.iqr[p], f.iqr[q])
        const rawDark = medMin - crossingDark(l, w, h, 0, px1, py0, py1)
        const rawBright = crossingBright(l, w, h, 0, px1, py0, py1) - medMax
        hLinkDark[p] = gate(rawDark, g)
        hLinkBright[p] = gate(rawBright, g)
        // Weak links must be ONE-SIDED: a real dark line crossing shows no
        // bright crossing at the same border; texture shows both at once.
        hWeakDark[p] = rawBright < linkGate ? gate(rawDark, linkGate) : 0
        hWeakBright[p] = rawDark < linkGate ? gate(rawBright, linkGate) : 0
      }
      if (oy + 1 < outH) {
        const q = p + outW
        const medMin = Math.min(f.medL[p], f.medL[q])
        const medMax = Math.max(f.medL[p], f.medL[q])
        const g = linkGate + Math.max(f.iqr[p], f.iqr[q])
        const rawDark = medMin - crossingDark(l, w, h, 1, py1, px0, px1)
        const rawBright = crossingBright(l, w, h, 1, py1, px0, px1) - medMax
        vLinkDark[p] = gate(rawDark, g)
        vLinkBright[p] = gate(rawBright, g)
        vWeakDark[p] = rawBright < linkGate ? gate(rawDark, linkGate) : 0
        vWeakBright[p] = rawDark < linkGate ? gate(rawBright, linkGate) : 0
      }
    }
  }

  // ---- Continuity term ------------------------------------------------
  // Edge energy: a structure crossing a shared border costs lambda * link for
  // EACH endpoint that does not represent it: V(lp,lq) = link * ((1-isMin_p)
  // + (1-isMin_q)). This is a valid (decomposable) edge energy, so it folds
  // into the unaries — unlike a symmetric Potts disagreement penalty, it can
  // only recruit patches onto the structure, never extinguish sparse seeds.
  if (lambda > 0) {
    for (let oy = 0; oy < outH; oy++) {
      for (let ox = 0; ox < outW; ox++) {
        const p = oy * outW + ox
        let dark = 0
        let bright = 0
        if (ox > 0) {
          dark += hLinkDark[p - 1]
          bright += hLinkBright[p - 1]
        }
        if (ox + 1 < outW) {
          dark += hLinkDark[p]
          bright += hLinkBright[p]
        }
        if (oy > 0) {
          dark += vLinkDark[p - outW]
          bright += vLinkBright[p - outW]
        }
        if (oy + 1 < outH) {
          dark += vLinkDark[p]
          bright += vLinkBright[p]
        }
        unary[p * 3 + LABEL_MIN] -= lambda * dark
        unary[p * 3 + LABEL_MAX] -= lambda * bright
      }
    }
  }

  const labels = new Uint8Array(nPatches)
  for (let p = 0; p < nPatches; p++) {
    let best = LABEL_CENTER
    let bestCost = unary[p * 3]
    if (unary[p * 3 + LABEL_MIN] < bestCost) {
      best = LABEL_MIN
      bestCost = unary[p * 3 + LABEL_MIN]
    }
    if (unary[p * 3 + LABEL_MAX] < bestCost) {
      best = LABEL_MAX
    }
    labels[p] = best
  }

  // ---- Hysteresis extension ------------------------------------------------
  // Weak links recruit a patch only when the structure is CONFIRMED on the
  // other end (neighbor already labeled MIN/MAX). Sweep until stable; each
  // sweep extends the front by one patch, so iterations are bounded by the
  // longest weak chain.
  if (lambda > 0) {
    for (let iter = 0; iter < Math.max(outW, outH); iter++) {
      let changed = 0
      for (let oy = 0; oy < outH; oy++) {
        for (let ox = 0; ox < outW; ox++) {
          const p = oy * outW + ox
          if (labels[p] !== LABEL_CENTER) {
            continue
          }
          // Texture guard: thin structures are one-sided around the median;
          // texture has inner mass on BOTH sides. Never extend into texture.
          if (Math.min(f.actDark[p], f.actBright[p]) > 10) {
            continue
          }
          let darkSupport = 0
          let brightSupport = 0
          if (ox > 0) {
            const q = p - 1
            darkSupport += labels[q] === LABEL_MIN ? hWeakDark[q] : 0
            brightSupport += labels[q] === LABEL_MAX ? hWeakBright[q] : 0
          }
          if (ox + 1 < outW) {
            const q = p + 1
            darkSupport += labels[q] === LABEL_MIN ? hWeakDark[p] : 0
            brightSupport += labels[q] === LABEL_MAX ? hWeakBright[p] : 0
          }
          if (oy > 0) {
            const q = p - outW
            darkSupport += labels[q] === LABEL_MIN ? vWeakDark[q] : 0
            brightSupport += labels[q] === LABEL_MAX ? vWeakBright[q] : 0
          }
          if (oy + 1 < outH) {
            const q = p + outW
            darkSupport += labels[q] === LABEL_MIN ? vWeakDark[p] : 0
            brightSupport += labels[q] === LABEL_MAX ? vWeakBright[p] : 0
          }
          const minCost = unary[p * 3 + LABEL_MIN] - lambda * darkSupport
          const maxCost = unary[p * 3 + LABEL_MAX] - lambda * brightSupport
          if (minCost < 0 && minCost <= maxCost) {
            labels[p] = LABEL_MIN
            changed++
          }
          else if (maxCost < 0) {
            labels[p] = LABEL_MAX
            changed++
          }
        }
      }
      if (changed === 0) {
        break
      }
    }
  }

  // ---- Rescue mode: greedy base labels, MRF only fills CENTERs -------------
  if (rescue) {
    for (let p = 0; p < nPatches; p++) {
      const medL = f.medL[p]
      const meanL = f.meanL[p]
      const minL = f.minL[p]
      const maxL = f.maxL[p]
      let greedy = LABEL_CENTER
      if (medL < meanL && (maxL - medL) > (medL - minL)) {
        greedy = LABEL_MIN
      }
      else if (medL > meanL && (maxL - medL) < (medL - minL)) {
        greedy = LABEL_MAX
      }
      if (greedy !== LABEL_CENTER) {
        labels[p] = greedy
      }
    }
  }

  // ---- Emit ----------------------------------------------------------------
  const result = new PixelImageData(outW, outH)
  const out = result.data
  for (let p = 0; p < nPatches; p++) {
    const lab = labels[p]
    let selectedL = f.centerL[p]
    if (lab === LABEL_MIN) {
      const t = aa ? Math.min(1, f.darkCov[p] * 12) : 1
      selectedL = f.centerL[p] + (f.robustMinL[p] - f.centerL[p]) * t
    }
    else if (lab === LABEL_MAX) {
      const t = aa ? Math.min(1, f.brightCov[p] * 12) : 1
      selectedL = f.centerL[p] + (f.robustMaxL[p] - f.centerL[p]) * t
    }
    const [
      r,
      g,
      bRgb,
    ] = labToRgb255(selectedL, f.medA[p], f.medB[p])
    out[p * 4] = r
    out[p * 4 + 1] = g
    out[p * 4 + 2] = bRgb
    out[p * 4 + 3] = 255
  }

  // Expose labels for analysis/tests
  ;(result as PixelImageData & { _mrfLabels?: Uint8Array })._mrfLabels = labels
  return result
}
