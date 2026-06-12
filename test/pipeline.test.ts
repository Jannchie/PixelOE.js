import { describe, expect, it } from 'vitest'
import { PixelImageData } from '../src/core/imageData'
import { PixelOE } from '../src/pixeloe'

/**
 * End-to-end pipeline tests. The whole pipeline is pure TypeScript now,
 * so these run in Node without any canvas/WebGL shims.
 */

function syntheticImage(width: number, height: number): PixelImageData {
  const image = new PixelImageData(width, height)
  const data = image.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      // Gradient background with circles and stripes for edges
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

describe('pixeloe pipeline (e2e)', () => {
  it('runs the optimized (circle-kernel) pipeline end to end', () => {
    const input = syntheticImage(256, 192)
    const pixelOE = new PixelOE({
      pixelSize: 4,
      thickness: 2,
      targetSize: 64,
      edgeExpansionMode: 'optimized',
    })

    const { result } = pixelOE.pixelize(input)

    // Output is downscaled to ~targetSize then upscaled by pixelSize
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    expect(result.width % 4).toBe(0)

    // Output must not be degenerate (all one color)
    const first = result.getPixel(0, 0)
    let differs = false
    for (let y = 0; y < result.height && !differs; y += 7) {
      for (let x = 0; x < result.width && !differs; x += 7) {
        const p = result.getPixel(x, y)
        if (p[0] !== first[0] || p[1] !== first[1] || p[2] !== first[2]) {
          differs = true
        }
      }
    }
    expect(differs).toBe(true)
  })

  it('runs the legacy pipeline end to end', () => {
    const input = syntheticImage(192, 192)
    const pixelOE = new PixelOE({
      pixelSize: 4,
      thickness: 2,
      targetSize: 48,
      edgeExpansionMode: 'legacy',
      useEdgeOptimization: false,
    })

    const { result } = pixelOE.pixelize(input)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
  })

  it('supports quantization and intermediate output', () => {
    const input = syntheticImage(160, 160)
    const pixelOE = new PixelOE({
      pixelSize: 4,
      thickness: 1,
      targetSize: 40,
      doQuantization: true,
      numColors: 8,
    })

    const { result, intermediate, weights } = pixelOE.pixelize(input, true)
    expect(result.width).toBeGreaterThan(0)
    expect(intermediate).toBeDefined()
    expect(weights).toBeDefined()
  })

  it('respects noupscale', () => {
    const input = syntheticImage(128, 128)
    const withUpscale = new PixelOE({ pixelSize: 4, thickness: 1, targetSize: 32 }).pixelize(input)
    const withoutUpscale = new PixelOE({ pixelSize: 4, thickness: 1, targetSize: 32, noPostUpscale: true }).pixelize(input)

    expect(withUpscale.result.width).toBe(withoutUpscale.result.width * 4)
  })
})

describe('pixeloe pipeline benchmark', () => {
  it('processes a 768x768 image in reasonable time', () => {
    const input = syntheticImage(768, 768)
    const pixelOE = new PixelOE({
      pixelSize: 6,
      thickness: 3,
      targetSize: 128,
      edgeExpansionMode: 'optimized',
    })

    const start = performance.now()
    const { result } = pixelOE.pixelize(input)
    const elapsed = performance.now() - start

    console.log(`[benchmark] 768x768 optimized pipeline: ${elapsed.toFixed(1)}ms -> ${result.width}x${result.height}`)
    expect(result.width).toBeGreaterThan(0)
    // Loose upper bound: previous implementation took multiple seconds
    expect(elapsed).toBeLessThan(5000)
  }, 30_000)
})
