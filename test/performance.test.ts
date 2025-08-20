import { describe, expect, it } from 'vitest'
import { PixelImageData } from '../src/core/imageData'

/**
 * Performance testing utilities for PixelOE optimization
 */

export interface PerformanceResult {
  functionName: string
  iterations: number
  totalTime: number
  averageTime: number
  opsPerSecond: number
}

export const PerformanceTester = {
  /**
   * Benchmark a function with specified iterations
   */
  async benchmark<T extends any[], R>(
    fn: (...args: T) => R,
    args: T,
    iterations: number = 100,
    warmupRuns: number = 10,
  ): Promise<PerformanceResult> {
    // Warmup runs
    for (let i = 0; i < warmupRuns; i++) {
      fn(...args)
    }

    // Force garbage collection if available
    if (globalThis.gc) {
      globalThis.gc()
    }

    const startTime = performance.now()

    for (let i = 0; i < iterations; i++) {
      fn(...args)
    }

    const endTime = performance.now()
    const totalTime = endTime - startTime
    const averageTime = totalTime / iterations
    const opsPerSecond = 1000 / averageTime

    return {
      functionName: fn.name || 'anonymous',
      iterations,
      totalTime,
      averageTime,
      opsPerSecond,
    }
  },

  /**
   * Compare performance of two functions
   */
  async compare<T extends any[], R>(
    originalFn: (...args: T) => R,
    optimizedFn: (...args: T) => R,
    args: T,
    iterations: number = 100,
  ): Promise<{
    original: PerformanceResult
    optimized: PerformanceResult
    speedup: number
    improvement: string
  }> {
    console.log(`\n🔄 Performance comparison: ${originalFn.name} vs ${optimizedFn.name}`)

    const original = await this.benchmark(originalFn, args, iterations)
    const optimized = await this.benchmark(optimizedFn, args, iterations)

    const speedup = original.averageTime / optimized.averageTime
    const improvement = speedup > 1
      ? `${(speedup * 100 - 100).toFixed(1)}% faster`
      : `${(100 - speedup * 100).toFixed(1)}% slower`

    console.log(`📊 Original: ${original.averageTime.toFixed(3)}ms avg (${original.opsPerSecond.toFixed(0)} ops/s)`)
    console.log(`⚡ Optimized: ${optimized.averageTime.toFixed(3)}ms avg (${optimized.opsPerSecond.toFixed(0)} ops/s)`)
    console.log(`📈 Performance: ${improvement} (${speedup.toFixed(2)}x)`)

    return {
      original,
      optimized,
      speedup,
      improvement,
    }
  },

  /**
   * Generate test image data for performance testing
   */
  generateTestImage(width: number, height: number, pattern: 'random' | 'gradient' | 'noise' = 'random'): PixelImageData {
    const imageData = new PixelImageData(width, height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r: number, g: number, b: number

        switch (pattern) {
          case 'gradient': {
            r = Math.floor((x / width) * 255)
            g = Math.floor((y / height) * 255)
            b = Math.floor(((x + y) / (width + height)) * 255)
            break
          }
          case 'noise': {
            r = Math.floor(Math.random() * 64) + 96 // 96-160 range
            g = Math.floor(Math.random() * 64) + 96
            b = Math.floor(Math.random() * 64) + 96
            break
          }
          case 'random':
          default: {
            r = Math.floor(Math.random() * 256)
            g = Math.floor(Math.random() * 256)
            b = Math.floor(Math.random() * 256)
            break
          }
        }

        imageData.setPixel(x, y, [r, g, b, 255])
      }
    }

    return imageData
  },

  /**
   * Create test data sets of various sizes
   */
  createTestDataSets(): {
    small: PixelImageData
    medium: PixelImageData
    large: PixelImageData
  } {
    return {
      small: this.generateTestImage(64, 64, 'gradient'),
      medium: this.generateTestImage(256, 256, 'random'),
      large: this.generateTestImage(512, 512, 'noise'),
    }
  },
}

describe('performance testing infrastructure', () => {
  it('should create test images correctly', () => {
    const testImage = PerformanceTester.generateTestImage(10, 10, 'gradient')
    expect(testImage.width).toBe(10)
    expect(testImage.height).toBe(10)

    const pixel = testImage.getPixel(5, 5)
    expect(pixel).toHaveLength(4)
    expect(pixel[3]).toBe(255) // alpha
  })

  it('should benchmark functions correctly', async () => {
    const testFn = (x: number) => x * 2
    const result = await PerformanceTester.benchmark(testFn, [5], 10)

    expect(result.iterations).toBe(10)
    expect(result.totalTime).toBeGreaterThan(0)
    expect(result.averageTime).toBeGreaterThan(0)
    expect(result.opsPerSecond).toBeGreaterThan(0)
  })

  it('should create test data sets', () => {
    const datasets = PerformanceTester.createTestDataSets()

    expect(datasets.small.width).toBe(64)
    expect(datasets.medium.width).toBe(256)
    expect(datasets.large.width).toBe(512)
  })
})
