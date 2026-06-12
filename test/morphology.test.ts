import { describe, expect, it } from 'vitest'
import { PixelImageData } from '../src/core/imageData'
import { dilate, dilateSmooth, dilateWithKernel, erode, erodeSmooth, erodeWithKernel } from '../src/core/morphology'

function randomImage(width: number, height: number, seed = 1): PixelImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  let state = seed
  for (let i = 0; i < data.length; i++) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    data[i] = state % 256
  }
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255
  }
  return new PixelImageData(width, height, data)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : (Math.min(v, hi))
}

/** Brute-force reference: one weighted morphology pass over an arbitrary kernel. */
function referenceMorph(
  image: PixelImageData,
  kernel: number[][],
  isDilate: boolean,
  iterations: number,
): PixelImageData {
  let src = image
  const half = Math.floor(kernel.length / 2)

  for (let iter = 0; iter < iterations; iter++) {
    const out = new PixelImageData(src.width, src.height)
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const best = [
          isDilate ? -Infinity : Infinity,
          isDilate ? -Infinity : Infinity,
          isDilate ? -Infinity : Infinity,
          isDilate ? -Infinity : Infinity,
        ]
        for (const [ky, row] of kernel.entries()) {
          for (const [kx, weight] of row.entries()) {
            if (weight <= 0) {
              continue
            }
            const px = clamp(x + kx - half, 0, src.width - 1)
            const py = clamp(y + ky - half, 0, src.height - 1)
            const pixel = src.getPixel(px, py)
            for (let c = 0; c < 4; c++) {
              const v = isDilate
                ? pixel[c] / 255 + weight - 1
                : pixel[c] / 255 - weight + 1
              if (isDilate ? v > best[c] : v < best[c]) {
                best[c] = v
              }
            }
          }
        }
        out.setPixel(x, y, [
          Math.round(clamp(best[0], 0, 1) * 255),
          Math.round(clamp(best[1], 0, 1) * 255),
          Math.round(clamp(best[2], 0, 1) * 255),
          Math.round(clamp(best[3], 0, 1) * 255),
        ])
      }
    }
    src = out
  }

  return src
}

function expectImagesClose(actual: PixelImageData, expected: PixelImageData, tolerance: number): void {
  expect(actual.width).toBe(expected.width)
  expect(actual.height).toBe(expected.height)
  let maxDiff = 0
  for (let i = 0; i < actual.data.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(actual.data[i] - expected.data[i]))
  }
  expect(maxDiff).toBeLessThanOrEqual(tolerance)
}

/** Rebuild the python circle kernels independently for the reference. */
function circle(r: number): number[][] {
  const intR = Math.floor(r)
  const size = 2 * intR + 1
  const kernel = Array.from({ length: size }, () => Array.from({ length: size }, () => 0))
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const points = [
        [i - 0.5, j - 0.5],
        [i - 0.5, j + 0.5],
        [i + 0.5, j - 0.5],
        [i + 0.5, j + 0.5],
        [i, j + 0.5],
        [i, j - 0.5],
        [i + 0.5, j],
        [i - 0.5, j],
      ]
      const distances = points.map(p => Math.hypot(p[0] - intR, p[1] - intR))
      const maxD = Math.max(...distances)
      const minD = Math.min(...distances)
      if (maxD <= r) {
        kernel[i][j] = 1
      }
      else if (minD <= r) {
        kernel[i][j] = (r - minD) / (maxD - minD)
      }
    }
  }
  return kernel
}

const BOX = [
  [1, 1, 1],
  [1, 1, 1],
  [1, 1, 1],
]
const CROSS = [
  [0, 1, 0],
  [1, 1, 1],
  [0, 1, 0],
]

describe('morphology', () => {
  const image = randomImage(31, 17)

  it('dilate matches brute-force 3x3 box', () => {
    for (const iters of [1, 2, 3]) {
      expectImagesClose(dilate(image, iters), referenceMorph(image, BOX, true, iters), 1)
    }
  })

  it('erode matches brute-force 3x3 box', () => {
    for (const iters of [1, 2, 3]) {
      expectImagesClose(erode(image, iters), referenceMorph(image, BOX, false, iters), 1)
    }
  })

  it('dilatesmooth/erodesmooth match brute-force cross kernel', () => {
    expectImagesClose(dilateSmooth(image, 2), referenceMorph(image, CROSS, true, 2), 1)
    expectImagesClose(erodeSmooth(image, 2), referenceMorph(image, CROSS, false, 2), 1)
  })

  it('continuous kernels match brute-force weighted morphology', () => {
    const kernels: { [key: number]: number[][] } = {
      1: circle(1),
      2: circle(1.5),
      4: circle(2.5),
    }

    for (const [index, kernel] of Object.entries(kernels)) {
      expectImagesClose(
        dilateWithKernel(image, Number(index), 1),
        referenceMorph(image, kernel, true, 1),
        1,
      )
      expectImagesClose(
        erodeWithKernel(image, Number(index), 1),
        referenceMorph(image, kernel, false, 1),
        1,
      )
    }
  })

  it('throws on invalid kernel index', () => {
    expect(() => dilateWithKernel(image, 99)).toThrow()
  })
})
