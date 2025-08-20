import { describe, it, expect } from 'vitest'
import { PixelImageData } from '../src/core/imageData'

/**
 * Consistency testing utilities for verifying optimization correctness
 */

export interface ConsistencyResult {
  isIdentical: boolean
  maxDifference: number
  averageDifference: number
  totalPixels: number
  differentPixels: number
  differencePercentage: number
}

export class ConsistencyTester {
  /**
   * Compare two images pixel by pixel
   */
  static compareImages(
    original: PixelImageData, 
    optimized: PixelImageData, 
    tolerance: number = 0
  ): ConsistencyResult {
    if (original.width !== optimized.width || original.height !== optimized.height) {
      throw new Error('Images must have the same dimensions for comparison')
    }

    const totalPixels = original.width * original.height
    let maxDifference = 0
    let totalDifference = 0
    let differentPixels = 0

    for (let y = 0; y < original.height; y++) {
      for (let x = 0; x < original.width; x++) {
        const originalPixel = original.getPixel(x, y)
        const optimizedPixel = optimized.getPixel(x, y)
        
        let pixelDifference = 0
        let hasChannelDifference = false

        // Compare RGB channels (ignore alpha for now)
        for (let channel = 0; channel < 3; channel++) {
          const diff = Math.abs(originalPixel[channel] - optimizedPixel[channel])
          pixelDifference = Math.max(pixelDifference, diff)
          
          if (diff > tolerance) {
            hasChannelDifference = true
          }
        }

        maxDifference = Math.max(maxDifference, pixelDifference)
        totalDifference += pixelDifference
        
        if (hasChannelDifference) {
          differentPixels++
        }
      }
    }

    const averageDifference = totalDifference / totalPixels
    const differencePercentage = (differentPixels / totalPixels) * 100
    const isIdentical = maxDifference <= tolerance

    return {
      isIdentical,
      maxDifference,
      averageDifference,
      totalPixels,
      differentPixels,
      differencePercentage
    }
  }

  /**
   * Verify that optimization maintains output consistency
   */
  static verifyOptimization<T extends any[], R extends PixelImageData>(
    originalFn: (...args: T) => R,
    optimizedFn: (...args: T) => R,
    args: T,
    tolerance: number = 0,
    testName: string = 'optimization'
  ): boolean {
    console.log(`\n🔍 Consistency check: ${testName}`)
    
    const originalResult = originalFn(...args)
    const optimizedResult = optimizedFn(...args)
    
    const comparison = this.compareImages(originalResult, optimizedResult, tolerance)
    
    if (comparison.isIdentical) {
      console.log(`✅ Perfect consistency: All pixels identical`)
      return true
    } else {
      console.log(`❌ Consistency issue detected:`)
      console.log(`   Max difference: ${comparison.maxDifference}`)
      console.log(`   Avg difference: ${comparison.averageDifference.toFixed(3)}`)
      console.log(`   Different pixels: ${comparison.differentPixels}/${comparison.totalPixels} (${comparison.differencePercentage.toFixed(2)}%)`)
      
      if (comparison.maxDifference <= tolerance) {
        console.log(`⚠️  Within tolerance (${tolerance}), but not identical`)
        return true
      } else {
        console.log(`🚫 Exceeds tolerance (${tolerance})`)
        return false
      }
    }
  }

  /**
   * Create detailed difference map for debugging
   */
  static createDifferenceMap(
    original: PixelImageData,
    optimized: PixelImageData
  ): PixelImageData {
    if (original.width !== optimized.width || original.height !== optimized.height) {
      throw new Error('Images must have the same dimensions')
    }

    const differenceMap = new PixelImageData(original.width, original.height)

    for (let y = 0; y < original.height; y++) {
      for (let x = 0; x < original.width; x++) {
        const originalPixel = original.getPixel(x, y)
        const optimizedPixel = optimized.getPixel(x, y)
        
        const rDiff = Math.abs(originalPixel[0] - optimizedPixel[0])
        const gDiff = Math.abs(originalPixel[1] - optimizedPixel[1])
        const bDiff = Math.abs(originalPixel[2] - optimizedPixel[2])
        
        // Amplify differences for visibility
        const maxDiff = Math.max(rDiff, gDiff, bDiff)
        const amplified = Math.min(255, maxDiff * 10)
        
        differenceMap.setPixel(x, y, [amplified, amplified, amplified, 255])
      }
    }

    return differenceMap
  }

  /**
   * Test function consistency with multiple test cases
   */
  static testFunctionConsistency<T extends any[], R extends PixelImageData>(
    originalFn: (...args: T) => R,
    optimizedFn: (...args: T) => R,
    testCases: T[],
    tolerance: number = 0,
    functionName: string = 'function'
  ): boolean {
    console.log(`\n🧪 Testing ${functionName} consistency with ${testCases.length} test cases`)
    
    let allPassed = true
    
    for (let i = 0; i < testCases.length; i++) {
      console.log(`\n📋 Test case ${i + 1}/${testCases.length}`)
      const passed = this.verifyOptimization(
        originalFn,
        optimizedFn,
        testCases[i],
        tolerance,
        `${functionName} case ${i + 1}`
      )
      
      if (!passed) {
        allPassed = false
        console.log(`❌ Test case ${i + 1} failed`)
      }
    }
    
    if (allPassed) {
      console.log(`\n✅ All ${testCases.length} test cases passed for ${functionName}`)
    } else {
      console.log(`\n❌ Some test cases failed for ${functionName}`)
    }
    
    return allPassed
  }
}

describe('Consistency Testing Infrastructure', () => {
  it('should detect identical images', () => {
    const img1 = new PixelImageData(10, 10)
    const img2 = new PixelImageData(10, 10)
    
    // Fill with same pattern
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const color: [number, number, number, number] = [x * 25, y * 25, 128, 255]
        img1.setPixel(x, y, color)
        img2.setPixel(x, y, color)
      }
    }
    
    const result = ConsistencyTester.compareImages(img1, img2)
    expect(result.isIdentical).toBe(true)
    expect(result.maxDifference).toBe(0)
    expect(result.differentPixels).toBe(0)
  })

  it('should detect differences', () => {
    const img1 = new PixelImageData(10, 10)
    const img2 = new PixelImageData(10, 10)
    
    // Fill with different patterns
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        img1.setPixel(x, y, [100, 100, 100, 255])
        img2.setPixel(x, y, [100, 100, 105, 255])  // 5 difference in blue
      }
    }
    
    const result = ConsistencyTester.compareImages(img1, img2)
    expect(result.isIdentical).toBe(false)
    expect(result.maxDifference).toBe(5)
    expect(result.differentPixels).toBe(100) // All pixels different
  })

  it('should handle tolerance correctly', () => {
    const img1 = new PixelImageData(2, 2)
    const img2 = new PixelImageData(2, 2)
    
    img1.setPixel(0, 0, [100, 100, 100, 255])
    img2.setPixel(0, 0, [103, 100, 100, 255])  // 3 difference
    
    img1.setPixel(1, 0, [100, 100, 100, 255])
    img2.setPixel(1, 0, [100, 100, 100, 255])  // identical
    
    img1.setPixel(0, 1, [100, 100, 100, 255])
    img2.setPixel(0, 1, [100, 100, 100, 255])  // identical
    
    img1.setPixel(1, 1, [100, 100, 100, 255])
    img2.setPixel(1, 1, [100, 100, 100, 255])  // identical
    
    const resultNoTolerance = ConsistencyTester.compareImages(img1, img2, 0)
    expect(resultNoTolerance.isIdentical).toBe(false)
    expect(resultNoTolerance.differentPixels).toBe(1)
    
    const resultWithTolerance = ConsistencyTester.compareImages(img1, img2, 3)
    expect(resultWithTolerance.isIdentical).toBe(true)   // Within tolerance, so considered identical
    expect(resultWithTolerance.differentPixels).toBe(0)  // Within tolerance
  })
})