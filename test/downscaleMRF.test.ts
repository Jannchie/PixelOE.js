import { describe, expect, it } from 'vitest'
import { contrastDownscale } from '../src/core/downscale'
import { contrastDownscaleMRF } from '../src/core/downscaleMRF'
import { PixelImageData } from '../src/core/imageData'

/**
 * Minimal validation for the MRF downscale:
 * a thin dark line whose darkness fades in and out should stay CONNECTED
 * in the downscaled output. The greedy per-patch heuristic breaks it where
 * local salience dips; the pairwise continuity term should propagate the
 * MIN label along the line.
 */

const BG = 150

function makeFadingLineImage(size = 256): PixelImageData {
  const img = new PixelImageData(size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = BG
    d[i + 1] = BG
    d[i + 2] = BG
    d[i + 3] = 255
  }
  // 2px-thick sinusoidal dark line, darkness oscillating between strong (40)
  // and weak (110) along x — weak segments are below the unary threshold.
  for (let x = 0; x < size; x++) {
    const yc = Math.round(size / 2 + 40 * Math.sin(x / 20))
    const v = Math.round(40 + 70 * (0.5 + 0.5 * Math.sin(x / 13)))
    for (let t = 0; t < 2; t++) {
      const y = yc + t
      if (y >= 0 && y < size) {
        const idx = (y * size + x) * 4
        d[idx] = v
        d[idx + 1] = v
        d[idx + 2] = v
      }
    }
  }
  return img
}

/** Columns of the output that contain no pixel darker than the background. */
function countBrokenColumns(img: PixelImageData, threshold = BG - 25): number {
  let broken = 0
  for (let x = 0; x < img.width; x++) {
    let hasDark = false
    for (let y = 0; y < img.height; y++) {
      const [
        r,
        g,
        b,
      ] = img.getPixel(x, y)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (lum < threshold) {
        hasDark = true
        break
      }
    }
    if (!hasDark) {
      broken++
    }
  }
  return broken
}

describe('contrastdownscalemrf', () => {
  it('preserves a solid color', () => {
    const image = new PixelImageData(64, 64)
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = 200
      image.data[i + 1] = 100
      image.data[i + 2] = 50
      image.data[i + 3] = 255
    }
    const down = contrastDownscaleMRF(image, 16)
    expect(down.width).toBe(16)
    for (let y = 0; y < down.height; y++) {
      for (let x = 0; x < down.width; x++) {
        const [
          r,
          g,
          b,
        ] = down.getPixel(x, y)
        expect(Math.abs(r - 200)).toBeLessThanOrEqual(2)
        expect(Math.abs(g - 100)).toBeLessThanOrEqual(2)
        expect(Math.abs(b - 50)).toBeLessThanOrEqual(2)
      }
    }
  })

  it('keeps a fading thin line more connected than the greedy baseline', () => {
    const input = makeFadingLineImage(256)

    const baseline = contrastDownscale(input, 32)
    const unaryOnly = contrastDownscaleMRF(input, 32, { lambda: 0 })
    const mrf = contrastDownscaleMRF(input, 32)

    const baselineBreaks = countBrokenColumns(baseline)
    const unaryBreaks = countBrokenColumns(unaryOnly)
    const mrfBreaks = countBrokenColumns(mrf)

    console.log(`broken columns — baseline: ${baselineBreaks}/32, unary-only: ${unaryBreaks}/32, MRF: ${mrfBreaks}/32`)

    expect(mrfBreaks).toBeLessThan(baselineBreaks)
    expect(mrfBreaks).toBeLessThanOrEqual(unaryBreaks)
    expect(mrfBreaks).toBe(0)
  })
})
