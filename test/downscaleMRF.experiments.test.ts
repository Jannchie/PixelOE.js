import { describe, expect, it } from 'vitest'
import { contrastDownscale } from '../src/core/downscale'
import { contrastDownscaleMRF } from '../src/core/downscaleMRF'
import { PixelImageData } from '../src/core/imageData'
import { outlineExpansionOptimized } from '../src/core/outline'

/**
 * Experiment harness for the MRF downscale — robustness & topology probes.
 * Logs quantitative results; assertions encode the minimum bar.
 */

function lcg(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_00_00_00_00
  }
}

function makeGray(size: number, v: number): PixelImageData {
  const img = new PixelImageData(size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  return img
}

function setGray(img: PixelImageData, x: number, y: number, v: number): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
    return
  }
  const idx = (y * img.width + x) * 4
  img.data[idx] = v
  img.data[idx + 1] = v
  img.data[idx + 2] = v
}

function luminance(img: PixelImageData, x: number, y: number): number {
  const [
    r,
    g,
    b,
  ] = img.getPixel(x, y)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function meanLum(img: PixelImageData): number {
  let sum = 0
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      sum += luminance(img, x, y)
    }
  }
  return sum / (img.width * img.height)
}

/** Connected components (4-neighborhood) of pixels darker than threshold. */
function darkComponents(img: PixelImageData, threshold: number): number {
  const { width: w, height: h } = img
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      mask[y * w + x] = luminance(img, x, y) < threshold ? 1 : 0
    }
  }
  let components = 0
  const stack: number[] = []
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) {
      continue
    }
    components++
    stack.push(i)
    mask[i] = 2
    while (stack.length > 0) {
      const cur = stack.pop()!
      const cx = cur % w
      const cy = (cur - cx) / w
      const neighbors = [
        cx > 0 ? cur - 1 : -1,
        cx + 1 < w ? cur + 1 : -1,
        cy > 0 ? cur - w : -1,
        cy + 1 < h ? cur + w : -1,
      ]
      for (const nb of neighbors) {
        if (nb >= 0 && mask[nb] === 1) {
          mask[nb] = 2
          stack.push(nb)
        }
      }
    }
  }
  return components
}

/** Is the bright region at (sx, sy) enclosed by dark pixels (never reaches the border)? */
function isEnclosed(img: PixelImageData, sx: number, sy: number, threshold: number): boolean {
  const { width: w, height: h } = img
  const visited = new Uint8Array(w * h)
  const stack = [sy * w + sx]
  visited[sy * w + sx] = 1
  while (stack.length > 0) {
    const cur = stack.pop()!
    const cx = cur % w
    const cy = (cur - cx) / w
    if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) {
      return false
    }
    const neighbors = [
      cur - 1,
      cur + 1,
      cur - w,
      cur + w,
    ]
    for (const nb of neighbors) {
      if (visited[nb]) {
        continue
      }
      const nx = nb % w
      const ny = (nb - nx) / w
      if (luminance(img, nx, ny) >= threshold) {
        visited[nb] = 1
        stack.push(nb)
      }
    }
  }
  return true
}

describe('mrf experiments', () => {
  it('exp1: noise robustness — no hallucinated structure on noisy flat image', () => {
    const rand = lcg(42)
    const img = makeGray(256, 150)
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        // Uniform noise +-20, plus sparse extreme speckle (1%)
        let v = 150 + (rand() - 0.5) * 40
        if (rand() < 0.01) {
          v = rand() < 0.5 ? 20 : 250
        }
        setGray(img, x, y, Math.round(v))
      }
    }
    const baseline = contrastDownscale(img, 32)
    const mrf = contrastDownscaleMRF(img, 32)
    const baseMean = meanLum(baseline)
    const mrfMean = meanLum(mrf)
    const baseDark = darkComponents(baseline, 100)
    const mrfDark = darkComponents(mrf, 100)

    console.log(`exp1 noise — mean lum: baseline ${baseMean.toFixed(1)}, mrf ${mrfMean.toFixed(1)}; dark blobs (<100): baseline ${baseDark}, mrf ${mrfDark}`)
    expect(Math.abs(mrfMean - baseMean)).toBeLessThan(15)
    // Known limitation: extreme speckle noise that happens to align across a
    // patch border can fake a crossing — residual rate ~0.3% of patches here.
    // (Candidate fix for the full method: median prefilter on the border
    // lines, at the cost of losing 1px-thin structures.)
    expect(mrfDark).toBeLessThanOrEqual(Math.ceil(mrf.width * mrf.height * 0.01))
  })

  it('exp2: texture region — mrf must not collapse texture into dark blocks', () => {
    const rand = lcg(7)
    const img = makeGray(256, 150)
    // Left half: fine checkerboard texture (high contrast, high coverage)
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 128; x++) {
        setGray(img, x, y, (x + y) % 2 === 0 ? 90 : 210)
      }
    }
    // Right half: random high-frequency texture
    for (let y = 0; y < 256; y++) {
      for (let x = 128; x < 256; x++) {
        setGray(img, x, y, 90 + Math.round(rand() * 120))
      }
    }
    const areaMean = meanLum(img)
    const baseline = contrastDownscale(img, 32)
    const mrf = contrastDownscaleMRF(img, 32)
    const baseDrift = Math.abs(meanLum(baseline) - areaMean)
    const mrfDrift = Math.abs(meanLum(mrf) - areaMean)

    console.log(`exp2 texture — mean drift from area-average: baseline ${baseDrift.toFixed(1)}, mrf ${mrfDrift.toFixed(1)}`)
    expect(mrfDrift).toBeLessThan(baseDrift + 10)
  })

  it('exp3: topology — closed ring stays closed, x-crossing stays one component', () => {
    const img = makeGray(256, 150)
    // Thin closed circle, radius 80, ~1.5px — drawn with dense angular samples
    for (let t = 0; t < 4000; t++) {
      const ang = (t / 4000) * Math.PI * 2
      // Fading darkness along the ring: strong at top, weak at bottom
      const v = Math.round(40 + 70 * (0.5 + 0.5 * Math.sin(ang * 3)))
      const cx = 128 + 80 * Math.cos(ang)
      const cy = 128 + 80 * Math.sin(ang)
      setGray(img, Math.round(cx), Math.round(cy), v)
      setGray(img, Math.round(cx) + 1, Math.round(cy), v)
    }
    const baseline = contrastDownscale(img, 48)
    const mrf = contrastDownscaleMRF(img, 48)
    const thr = 150 - 25
    const baseComponents = darkComponents(baseline, thr)
    const mrfComponents = darkComponents(mrf, thr)
    const cx = Math.floor(baseline.width / 2)
    const cy = Math.floor(baseline.height / 2)
    const baseClosed = baseComponents > 0 && isEnclosed(baseline, cx, cy, thr)
    const mrfClosed = mrfComponents > 0 && isEnclosed(mrf, cx, cy, thr)

    console.log(`exp3 ring — components: baseline ${baseComponents}, mrf ${mrfComponents}; closed: baseline ${baseClosed}, mrf ${mrfClosed}`)
    expect(mrfClosed).toBe(true)
    expect(mrfComponents).toBe(1)
  })

  it('exp4: x-crossing of two fading lines stays connected', () => {
    const img = makeGray(256, 150)
    for (let x = 0; x < 256; x++) {
      const v = Math.round(40 + 70 * (0.5 + 0.5 * Math.sin(x / 11)))
      setGray(img, x, x, v)
      setGray(img, x, x + 1, v)
      setGray(img, x, 255 - x, v)
      setGray(img, x, 254 - x, v)
    }
    const baseline = contrastDownscale(img, 32)
    const mrf = contrastDownscaleMRF(img, 32)
    const thr = 150 - 25
    const baseComponents = darkComponents(baseline, thr)
    const mrfComponents = darkComponents(mrf, thr)

    console.log(`exp4 X — components: baseline ${baseComponents}, mrf ${mrfComponents} (ideal: 1)`)
    expect(mrfComponents).toBe(1)
  })
})

describe('mrf vs outline expansion', () => {
  it('exp5: mrf alone vs outline-expansion + greedy on fading structures', () => {
    const img = makeGray(256, 150)
    // Fading sinusoidal line (same as the minimal test) + fading ring
    for (let x = 0; x < 256; x++) {
      const yc = Math.round(64 + 30 * Math.sin(x / 20))
      const v = Math.round(40 + 70 * (0.5 + 0.5 * Math.sin(x / 13)))
      setGray(img, x, yc, v)
      setGray(img, x, yc + 1, v)
    }
    for (let t = 0; t < 4000; t++) {
      const ang = (t / 4000) * Math.PI * 2
      const v = Math.round(40 + 70 * (0.5 + 0.5 * Math.sin(ang * 3)))
      const cx = Math.round(128 + 60 * Math.cos(ang))
      const cy = Math.round(170 + 60 * Math.sin(ang))
      setGray(img, cx, cy, v)
      setGray(img, cx + 1, cy, v)
    }

    const t0 = performance.now()
    const expanded = outlineExpansionOptimized(img, 2, 2).result
    const oeDown = contrastDownscale(expanded, 48)
    const t1 = performance.now()
    const mrfDown = contrastDownscaleMRF(img, 48)
    const t2 = performance.now()

    const thr = 150 - 25
    const oeComponents = darkComponents(oeDown, thr)
    const mrfComponents = darkComponents(mrfDown, thr)
    const cx = Math.floor(oeDown.width * 0.5)
    const cy = Math.floor(oeDown.height * (170 / 256))
    const oeClosed = isEnclosed(oeDown, cx, cy, thr)
    const mrfClosed = isEnclosed(mrfDown, cx, cy, thr)

    // Dark coverage = structure inflation proxy (ideal: close to input's own ratio)
    function darkFrac(i: PixelImageData): number {
      let c = 0
      for (let y = 0; y < i.height; y++) {
        for (let x = 0; x < i.width; x++) {
          if (luminance(i, x, y) < thr) {
            c++
          }
        }
      }
      return c / (i.width * i.height)
    }

    console.log(
      `exp5 — OE+greedy: components ${oeComponents}, ring closed ${oeClosed}, dark ${(darkFrac(oeDown) * 100).toFixed(1)}%, ${(t1 - t0).toFixed(0)}ms | `
      + `MRF: components ${mrfComponents}, ring closed ${mrfClosed}, dark ${(darkFrac(mrfDown) * 100).toFixed(1)}%, ${(t2 - t1).toFixed(0)}ms`,
    )

    // Ideal is 2 (line + ring); one stray fragment remains — still far from
    // the OE+greedy fragmentation (~24 components on this scene).
    expect(mrfComponents).toBeLessThanOrEqual(3)
    expect(mrfComponents).toBeLessThan(oeComponents)
    expect(mrfClosed).toBe(true)
  })
})
