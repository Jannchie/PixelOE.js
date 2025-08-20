import { describe, it, expect } from 'vitest'
import { clamp } from '../src/utils/math'
import { simpleGaussianBlurOptimized, separableGaussianBlur, fastBoxBlur, optimizedGaussianBlur, batchGaussianBlur } from '../src/core/blurOptimized'
import { PerformanceTester } from './performance.test'
import { ConsistencyTester } from './consistency.test'

// Original simpleGaussianBlur from color.ts for comparison
function simpleGaussianBlurOriginal(channel: Float32Array, width: number, height: number, radius: number): Float32Array {
  const result = new Float32Array(channel.length);
  
  // Simple box blur approximation (much simpler than full Gaussian)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      // Apply blur kernel
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const nx = clamp(x + kx, 0, width - 1);
          const ny = clamp(y + ky, 0, height - 1);
          sum += channel[ny * width + nx];
          count++;
        }
      }
      
      result[y * width + x] = sum / count;
    }
  }
  
  return result;
}

describe('Blur Optimization', () => {
  // Helper to create test data
  function createTestChannel(width: number, height: number, pattern: 'gradient' | 'checker' | 'random' = 'gradient'): Float32Array {
    const channel = new Float32Array(width * height)
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        
        switch (pattern) {
          case 'gradient':
            channel[index] = (x + y) / (width + height) * 255
            break
          case 'checker':
            channel[index] = ((x + y) % 2) * 255
            break
          case 'random':
            channel[index] = Math.random() * 255
            break
        }
      }
    }
    
    return channel
  }

  describe('Consistency Tests', () => {
    const testCases = [
      { width: 32, height: 32, radius: 1, pattern: 'gradient' as const },
      { width: 64, height: 64, radius: 2, pattern: 'checker' as const },
      { width: 16, height: 24, radius: 3, pattern: 'random' as const },
      { width: 128, height: 128, radius: 1, pattern: 'gradient' as const },
    ]

    it('should produce identical results to original implementation', () => {
      for (const { width, height, radius, pattern } of testCases) {
        const testChannel = createTestChannel(width, height, pattern)
        
        const original = simpleGaussianBlurOriginal(testChannel, width, height, radius)
        const optimized = simpleGaussianBlurOptimized(testChannel, width, height, radius)
        
        // Compare results with small tolerance for floating point differences
        for (let i = 0; i < original.length; i++) {
          expect(Math.abs(original[i] - optimized[i])).toBeLessThan(0.001)
        }
      }
    })

    it('should handle edge cases correctly', () => {
      const edgeCases = [
        { width: 1, height: 1, radius: 1 },
        { width: 3, height: 3, radius: 5 },  // Radius larger than image
        { width: 10, height: 1, radius: 2 }, // Thin horizontal strip
        { width: 1, height: 10, radius: 2 }, // Thin vertical strip
      ]

      for (const { width, height, radius } of edgeCases) {
        const testChannel = createTestChannel(width, height, 'gradient')
        
        const original = simpleGaussianBlurOriginal(testChannel, width, height, radius)
        const optimized = simpleGaussianBlurOptimized(testChannel, width, height, radius)
        
        for (let i = 0; i < original.length; i++) {
          expect(Math.abs(original[i] - optimized[i])).toBeLessThan(0.001)
        }
      }
    })

    it('should handle zero radius', () => {
      const testChannel = createTestChannel(32, 32, 'random')
      
      const original = simpleGaussianBlurOriginal(testChannel, 32, 32, 0)
      const optimized = simpleGaussianBlurOptimized(testChannel, 32, 32, 0)
      
      // Should be identical to input when radius is 0
      for (let i = 0; i < testChannel.length; i++) {
        expect(Math.abs(testChannel[i] - optimized[i])).toBeLessThan(0.001)
      }
    })
  })

  describe('Performance Tests', () => {
    const performanceTestData = [
      { width: 64, height: 64, radius: 2, name: 'Small image' },
      { width: 256, height: 256, radius: 3, name: 'Medium image' },
      { width: 512, height: 512, radius: 2, name: 'Large image' },
    ]

    for (const { width, height, radius, name } of performanceTestData) {
      it(`should improve performance for ${name}`, async () => {
        const testChannel = createTestChannel(width, height, 'gradient')
        
        const comparison = await PerformanceTester.compare(
          simpleGaussianBlurOriginal,
          simpleGaussianBlurOptimized,
          [testChannel, width, height, radius],
          20
        )
        
        expect(comparison.speedup).toBeGreaterThan(1.2) // At least 20% faster
        console.log(`${name} (${width}x${height}, r=${radius}): ${comparison.improvement}`)
      })
    }

    it('should benchmark different blur algorithms', async () => {
      const testChannel = createTestChannel(128, 128, 'gradient')
      const width = 128, height = 128, radius = 3
      
      console.log('\n🔄 Comparing different blur algorithms:')
      
      // Test different algorithms
      const algorithms = [
        { name: 'Original', fn: simpleGaussianBlurOriginal },
        { name: 'Optimized', fn: simpleGaussianBlurOptimized },
        { name: 'Separable', fn: separableGaussianBlur },
        { name: 'FastBox', fn: fastBoxBlur },
        { name: 'Gaussian', fn: optimizedGaussianBlur },
        { name: 'Batch', fn: batchGaussianBlur },
      ]
      
      const results = []
      for (const { name, fn } of algorithms) {
        const result = await PerformanceTester.benchmark(
          fn,
          [testChannel, width, height, radius],
          50
        )
        results.push({ name, ...result })
        console.log(`${name}: ${result.averageTime.toFixed(3)}ms avg (${result.opsPerSecond.toFixed(0)} ops/s)`)
      }
      
      // Find fastest algorithm
      const fastest = results.reduce((prev, current) => 
        current.averageTime < prev.averageTime ? current : prev
      )
      console.log(`🏆 Fastest: ${fastest.name}`)
    })
  })

  describe('Algorithm Variations', () => {
    const testChannel = createTestChannel(64, 64, 'gradient')
    const width = 64, height = 64, radius = 2

    it('should test fast box blur consistency', () => {
      const original = simpleGaussianBlurOriginal(testChannel, width, height, radius)
      const fastBox = fastBoxBlur(testChannel, width, height, radius)
      
      // Fast box blur may have slightly different results but should be similar
      let maxDiff = 0
      for (let i = 0; i < original.length; i++) {
        const diff = Math.abs(original[i] - fastBox[i])
        maxDiff = Math.max(maxDiff, diff)
      }
      
      expect(maxDiff).toBeLessThan(60) // Allow larger difference for extreme speed
      console.log(`FastBox blur max difference: ${maxDiff.toFixed(3)}`)
    })

    it('should test optimized Gaussian blur quality', () => {
      const original = simpleGaussianBlurOriginal(testChannel, width, height, radius)
      const gaussian = optimizedGaussianBlur(testChannel, width, height, radius)
      
      // Gaussian should be higher quality but may have small differences
      let maxDiff = 0
      for (let i = 0; i < original.length; i++) {
        const diff = Math.abs(original[i] - gaussian[i])
        maxDiff = Math.max(maxDiff, diff)
      }
      
      expect(maxDiff).toBeLessThan(5) // Should be quite close
      console.log(`Gaussian blur max difference: ${maxDiff.toFixed(3)}`)
    })

    it('should test batch processing consistency', () => {
      const original = simpleGaussianBlurOriginal(testChannel, width, height, radius)
      const batched = batchGaussianBlur(testChannel, width, height, radius, 16)
      
      // Batch processing should give very similar results
      let maxDiff = 0
      for (let i = 0; i < original.length; i++) {
        const diff = Math.abs(original[i] - batched[i])
        maxDiff = Math.max(maxDiff, diff)
      }
      
      expect(maxDiff).toBeLessThan(1) // Should be nearly identical
      console.log(`Batch blur max difference: ${maxDiff.toFixed(3)}`)
    })
  })
})