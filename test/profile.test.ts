import { describe, expect, it } from 'vitest'
import { matchColorFast } from '../src/core/colorOptimizedFast'
import { contrastDownscale } from '../src/core/downscale'
import { PixelImageData } from '../src/core/imageData'
import { dilateWithKernel, erodeWithKernel } from '../src/core/morphology'
import { outlineExpansionOptimized } from '../src/core/outline'
import { rgbaToLabLuminance01, rgbaToLabPlanes } from '../src/core/planes'
import { quantize01ToU8, slidingMax, slidingMedianU8, slidingMin } from '../src/core/slidingStats'

function syntheticImage(width: number, height: number): PixelImageData {
  const image = new PixelImageData(width, height)
  const data = image.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const cx = x - width / 2
      const cy = y - height / 2
      const inCircle = cx * cx + cy * cy < (width / 4) ** 2
      const stripe = Math.floor(x / 16) % 2 === 0
      data[idx] = inCircle ? 220 : Math.floor((x / width) * 255)
      data[idx + 1] = stripe ? 180 : Math.floor((y / height) * 255)
      data[idx + 2] = inCircle && stripe ? 40 : 128
      data[idx + 3] = 255
    }
  }
  return image
}

function time(label: string, fn: () => unknown): number {
  const start = performance.now()
  fn()
  const elapsed = performance.now() - start
  console.log(`[profile] ${label}: ${elapsed.toFixed(1)}ms`)
  return elapsed
}

describe('profile at user resolution (informational)', () => {
  // Matches the user's working resolution: 1024x1536 -> 1672x2508 (targetSize=256, patchSize=8)
  const W = 1672
  const H = 2508
  const image = syntheticImage(W, H)

  it('profiles outline expansion internals', () => {
    const lum = rgbaToLabLuminance01(image.data, W, H)
    time('rgbaToLabLuminance01', () => rgbaToLabLuminance01(image.data, W, H))
    const u8 = quantize01ToU8(lum)
    time('quantize01ToU8', () => quantize01ToU8(lum))
    time('slidingMedianU8 r=8', () => slidingMedianU8(u8, W, H, 8))
    time('slidingMin r=4', () => slidingMin(lum, W, H, 4))
    time('slidingMax r=4', () => slidingMax(lum, W, H, 4))
    time('erodeWithKernel k=3', () => erodeWithKernel(image, 3, 1))
    time('dilateWithKernel k=3', () => dilateWithKernel(image, 3, 1))
    time('erode+dilate2+erode k=2', () => {
      let r = erodeWithKernel(image, 2, 1)
      r = dilateWithKernel(r, 2, 2)
      erodeWithKernel(r, 2, 1)
    })
    const total = time('outlineExpansionOptimized total', () => outlineExpansionOptimized(image, 3, 3, 8, 9, 4))
    expect(total).toBeGreaterThan(0)
  }, 120_000)

  it('profiles color matching and downscale', () => {
    const target = syntheticImage(W, H)
    time('rgbaToLabPlanes', () => rgbaToLabPlanes(image.data, W, H))
    time('matchColorFast', () => matchColorFast(image, target))
    time('contrastDownscale -> 256', () => contrastDownscale(image, 256))
    expect(true).toBe(true)
  }, 120_000)
})
