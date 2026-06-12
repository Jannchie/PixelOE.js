import { describe, expect, it } from 'vitest'
import { _medianOfScratch, contrastDownscale } from '../src/core/downscale'
import { PixelImageData } from '../src/core/imageData'

function lcg(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_00_00_00_00
  }
}

describe('downscale', () => {
  it('medianofscratch matches sort-based median', () => {
    const rand = lcg(99)
    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + Math.floor(rand() * 80)
      const values = Array.from({ length: n }, () => rand() * 200 - 100)
      const scratch = new Float32Array(128)
      scratch.set(values)

      const sorted = values.map(v => Math.fround(v)).toSorted((a, b) => a - b)
      const mid = n >> 1
      const expected = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]

      expect(_medianOfScratch(scratch, n)).toBeCloseTo(expected, 5)
    }
  })

  it('preserves a solid color', () => {
    const image = new PixelImageData(64, 64)
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = 200
      image.data[i + 1] = 100
      image.data[i + 2] = 50
      image.data[i + 3] = 255
    }
    const down = contrastDownscale(image, 16)
    expect(down.width).toBe(16)
    expect(down.height).toBe(16)
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

  it('produces aspect-corrected dimensions', () => {
    const image = new PixelImageData(200, 100)
    const down = contrastDownscale(image, 64)
    expect(down.width / down.height).toBeCloseTo(2, 0)
  })
})
