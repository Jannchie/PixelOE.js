import type { PixelImageData } from './imageData'
import type { LuminanceMethod } from './luminance'
import { detectEdgesSobel } from './edgeDetection'
import { getLuminanceMethodInfo } from './luminance'

/**
 * Compare different luminance methods for edge detection quality
 */

export interface LuminanceComparisonResult {
  method: LuminanceMethod
  edgeCount: number
  avgEdgeStrength: number
  processingTime: number
  edgeCoverage: number
  methodInfo: ReturnType<typeof getLuminanceMethodInfo>
}

/**
 * Test all luminance methods on an image and compare results
 */
export async function compareLuminanceMethods(
  imageData: PixelImageData,
  threshold: number = 0.1,
): Promise<LuminanceComparisonResult[]> {
  const methods: LuminanceMethod[] = ['rec601', 'rec709', 'rec2020', 'linear', 'lab', 'oklab', 'wcag']
  const results: LuminanceComparisonResult[] = []

  console.log(`🔬 Comparing ${methods.length} luminance methods on ${imageData.width}x${imageData.height} image`)

  for (const method of methods) {
    const startTime = performance.now()

    try {
      const { edgeMask, edgeStrength } = detectEdgesSobel(imageData, threshold, method)
      const endTime = performance.now()

      // Calculate statistics
      let edgeCount = 0
      let totalStrength = 0

      for (let i = 0; i < edgeMask.length; i++) {
        if (edgeMask[i] > 0) {
          edgeCount++
          totalStrength += edgeStrength[i]
        }
      }

      const avgEdgeStrength = edgeCount > 0 ? totalStrength / edgeCount : 0
      const edgeCoverage = edgeCount / edgeMask.length

      results.push({
        method,
        edgeCount,
        avgEdgeStrength,
        processingTime: endTime - startTime,
        edgeCoverage,
        methodInfo: getLuminanceMethodInfo(method),
      })

      console.log(`✅ ${method}: ${edgeCount} edges (${(edgeCoverage * 100).toFixed(1)}%), avg strength: ${avgEdgeStrength.toFixed(3)}, time: ${(endTime - startTime).toFixed(1)}ms`)
    }
    catch (error) {
      console.error(`❌ ${method} failed:`, error)
    }
  }

  return results.sort((a, b) => b.avgEdgeStrength - a.avgEdgeStrength)
}

/**
 * Find the best luminance method for a specific image
 */
export async function findOptimalLuminanceMethod(
  imageData: PixelImageData,
  threshold: number = 0.1,
  prioritizeQuality: boolean = true,
): Promise<{ method: LuminanceMethod, reason: string, score: number }> {
  const results = await compareLuminanceMethods(imageData, threshold)

  if (results.length === 0) {
    return { method: 'rec709', reason: 'Fallback to default', score: 0 }
  }

  // Calculate composite score based on priorities
  const scoredResults = results.map((result) => {
    let score = 0

    if (prioritizeQuality) {
      // Prioritize edge detection quality
      score += result.avgEdgeStrength * 0.4
      score += Math.min(result.edgeCoverage * 10, 1) * 0.3 // Cap edge coverage influence
      score += (1 / Math.max(result.processingTime, 1)) * 0.3 // Inverse of processing time
    }
    else {
      // Prioritize performance
      score += (1 / Math.max(result.processingTime, 1)) * 0.5
      score += result.avgEdgeStrength * 0.3
      score += Math.min(result.edgeCoverage * 10, 1) * 0.2
    }

    return { ...result, score }
  })

  const bestResult = scoredResults.sort((a, b) => b.score - a.score)[0]

  let reason = ''
  if (prioritizeQuality) {
    if (bestResult.method === 'oklab') {
      reason = 'Oklab provides the most perceptually uniform luminance'
    }
    else if (bestResult.method === 'lab') {
      reason = 'Lab L* offers excellent perceptual uniformity for edge detection'
    }
    else if (bestResult.method === 'linear') {
      reason = 'Linear luminance balances accuracy and performance well'
    }
    else {
      reason = `${bestResult.method} provides the best edge detection quality for this image`
    }
  }
  else {
    if (bestResult.method === 'rec709' || bestResult.method === 'rec601') {
      reason = 'Fast RGB-based calculation with good edge detection'
    }
    else {
      reason = `${bestResult.method} offers the best performance-quality balance`
    }
  }

  return {
    method: bestResult.method,
    reason,
    score: bestResult.score,
  }
}

/**
 * Get luminance method recommendations based on image characteristics
 */
export function getLuminanceRecommendation(
  imageData: PixelImageData,
  useCase: 'speed' | 'quality' | 'balanced' = 'balanced',
): { method: LuminanceMethod, reason: string } {
  const pixelCount = imageData.width * imageData.height

  // Fast analysis of image characteristics
  const rawData = imageData.toCanvasImageData().data
  let totalR = 0; let totalG = 0; let totalB = 0
  let variance = 0

  // Sample 1% of pixels for quick analysis
  const sampleStep = Math.max(1, Math.floor(pixelCount / 100))
  let sampleCount = 0

  for (let i = 0; i < rawData.length; i += sampleStep * 4) {
    totalR += rawData[i]
    totalG += rawData[i + 1]
    totalB += rawData[i + 2]
    sampleCount++
  }

  const avgR = totalR / sampleCount
  const avgG = totalG / sampleCount
  const avgB = totalB / sampleCount

  // Calculate color variance
  for (let i = 0; i < rawData.length; i += sampleStep * 4) {
    const r = rawData[i] - avgR
    const g = rawData[i + 1] - avgG
    const b = rawData[i + 2] - avgB
    variance += (r * r + g * g + b * b) / 3
  }
  variance /= sampleCount

  // Analyze image characteristics
  const isHighVariance = variance > 2000 // High color variation
  const isColorful = Math.abs(avgR - avgG) > 30 || Math.abs(avgG - avgB) > 30 || Math.abs(avgR - avgB) > 30
  const isLarge = pixelCount > 500000 // > 500K pixels

  switch (useCase) {
    case 'speed':
      if (isLarge) {
        return { method: 'rec709', reason: 'Fast processing for large images' }
      }
      return { method: 'rec601', reason: 'Maximum speed for smaller images' }

    case 'quality':
      if (isColorful && isHighVariance) {
        return { method: 'oklab', reason: 'Best perceptual uniformity for colorful, complex images' }
      }
      else if (isHighVariance) {
        return { method: 'lab', reason: 'Excellent edge detection for high-contrast images' }
      }
      return { method: 'linear', reason: 'High quality with good performance' }

    case 'balanced':
    default:
      if (isLarge && !isColorful) {
        return { method: 'rec709', reason: 'Good balance for large, simple images' }
      }
      else if (isColorful) {
        return { method: 'linear', reason: 'Better color handling while maintaining speed' }
      }
      return { method: 'rec709', reason: 'Standard balanced approach' }
  }
}
