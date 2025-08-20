import { describe, it, expect } from 'vitest'
import { rgbToLab, labToRgb } from '../src/core/colorSpace'
import { rgbToLabOptimized, labToRgbOptimized, batchRgbToLabOptimized, batchLabToRgbOptimized } from '../src/core/colorSpaceOptimized'
import { PerformanceTester } from './performance.test'
import { ConsistencyTester } from './consistency.test'

describe('Color Space Optimization', () => {
  describe('Single Color Conversion', () => {
    const testColors = [
      [0, 0, 0],      // Black
      [255, 255, 255], // White  
      [255, 0, 0],     // Red
      [0, 255, 0],     // Green
      [0, 0, 255],     // Blue
      [128, 128, 128], // Gray
      [255, 128, 64],  // Orange
      [64, 192, 255],  // Light blue
      [200, 50, 150],  // Purple
      [100, 200, 75],  // Light green
    ]

    it('should produce identical RGB->LAB results', () => {
      for (const [r, g, b] of testColors) {
        const original = rgbToLab(r, g, b)
        const optimized = rgbToLabOptimized(r, g, b)
        
        // Allow small floating point differences (< 0.1)
        expect(Math.abs(original[0] - optimized[0])).toBeLessThan(0.1)
        expect(Math.abs(original[1] - optimized[1])).toBeLessThan(0.1)
        expect(Math.abs(original[2] - optimized[2])).toBeLessThan(0.1)
      }
    })

    it('should produce identical LAB->RGB results', () => {
      for (const [r, g, b] of testColors) {
        // Convert to LAB first
        const [l, a, bLab] = rgbToLab(r, g, b)
        
        const original = labToRgb(l, a, bLab)
        const optimized = labToRgbOptimized(l, a, bLab)
        
        // Allow small integer differences (±1)
        expect(Math.abs(original[0] - optimized[0])).toBeLessThanOrEqual(1)
        expect(Math.abs(original[1] - optimized[1])).toBeLessThanOrEqual(1)
        expect(Math.abs(original[2] - optimized[2])).toBeLessThanOrEqual(1)
      }
    })

    it('should maintain round-trip consistency', () => {
      for (const [r, g, b] of testColors) {
        // Original round trip
        const [l1, a1, b1] = rgbToLab(r, g, b)
        const [r2, g2, b2] = labToRgb(l1, a1, b1)
        
        // Optimized round trip
        const [l3, a3, b3] = rgbToLabOptimized(r, g, b)
        const [r4, g4, b4] = labToRgbOptimized(l3, a3, b3)
        
        // Both should be close to original
        expect(Math.abs(r - r2)).toBeLessThanOrEqual(2)
        expect(Math.abs(g - g2)).toBeLessThanOrEqual(2)
        expect(Math.abs(b - b2)).toBeLessThanOrEqual(2)
        
        expect(Math.abs(r - r4)).toBeLessThanOrEqual(2)
        expect(Math.abs(g - g4)).toBeLessThanOrEqual(2)
        expect(Math.abs(b - b4)).toBeLessThanOrEqual(2)
      }
    })
  })

  describe('Performance Tests', () => {
    it('should benchmark RGB->LAB conversion performance', async () => {
      const testColor: [number, number, number] = [128, 64, 192]
      
      const comparison = await PerformanceTester.compare(
        rgbToLab,
        rgbToLabOptimized,
        testColor,
        1000
      )
      
      expect(comparison.speedup).toBeGreaterThan(1.2) // At least 20% faster
      console.log(`RGB->LAB optimization: ${comparison.improvement}`)
    })

    it('should benchmark LAB->RGB conversion performance', async () => {
      const testLab: [number, number, number] = [50, 25, -25]
      
      const comparison = await PerformanceTester.compare(
        labToRgb,
        labToRgbOptimized,
        testLab,
        1000
      )
      
      expect(comparison.speedup).toBeGreaterThan(1.2) // At least 20% faster
      console.log(`LAB->RGB optimization: ${comparison.improvement}`)
    })

    it('should test batch conversion performance', async () => {
      // Generate test data
      const testPixels: number[][] = []
      for (let i = 0; i < 1000; i++) {
        testPixels.push([
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256), 
          Math.floor(Math.random() * 256)
        ])
      }
      
      const singleConversion = (pixels: number[][]) => {
        return pixels.map(([r, g, b]) => rgbToLab(r, g, b))
      }
      
      const batchConversion = (pixels: number[][]) => {
        return batchRgbToLabOptimized(pixels)
      }
      
      const comparison = await PerformanceTester.compare(
        singleConversion,
        batchConversion,
        [testPixels],
        50
      )
      
      expect(comparison.speedup).toBeGreaterThan(1.0) // Should be faster or at least same speed
      console.log(`Batch RGB->LAB optimization: ${comparison.improvement}`)
    })
  })

  describe('Edge Cases', () => {
    it('should handle edge values correctly', () => {
      const edgeCases = [
        [0, 0, 0],        // Minimum
        [255, 255, 255],  // Maximum
        [1, 1, 1],        // Near minimum
        [254, 254, 254],  // Near maximum
      ]
      
      for (const [r, g, b] of edgeCases) {
        const original = rgbToLab(r, g, b)
        const optimized = rgbToLabOptimized(r, g, b)
        
        expect(Math.abs(original[0] - optimized[0])).toBeLessThan(0.5)
        expect(Math.abs(original[1] - optimized[1])).toBeLessThan(0.5)
        expect(Math.abs(original[2] - optimized[2])).toBeLessThan(0.5)
      }
    })

    it('should handle extreme LAB values', () => {
      const labCases = [
        [0, 0, 0],           // Black
        [100, 0, 0],         // White  
        [50, -100, 100],     // Extreme colors
        [75, 50, -50],       // Mid-range
      ]
      
      for (const [l, a, b] of labCases) {
        const original = labToRgb(l, a, b)
        const optimized = labToRgbOptimized(l, a, b)
        
        expect(Math.abs(original[0] - optimized[0])).toBeLessThanOrEqual(2)
        expect(Math.abs(original[1] - optimized[1])).toBeLessThanOrEqual(2)
        expect(Math.abs(original[2] - optimized[2])).toBeLessThanOrEqual(2)
      }
    })
  })
})