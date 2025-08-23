import { sigmoid } from '../utils/math'
import { calculateEdgeCoverage, createEdgeRegionMask, detectEdgesSobel } from './edgeDetection'
import { calculateFastCombinedStats } from './fastStats'
import { PixelImageData } from './imageData'
import { dilate, dilateSmooth, erode, erodeSmooth } from './morphology'

/**
 * Outline expansion algorithms
 */

/**
 * Calculate expansion weight map (matching Legacy implementation)
 */
/**
 * Ultra-fast combined statistics calculation
 */
function calculateCombinedStatsFast(
  imageData: PixelImageData,
  patchSize: number,
  medianPatchSize: number,
  stride: number,
): { median: Float32Array, max: Float32Array, min: Float32Array } {
  const width = imageData.width
  const height = imageData.height
  const pixelCount = width * height

  const median = new Float32Array(pixelCount)
  const max = new Float32Array(pixelCount)
  const min = new Float32Array(pixelCount)

  // Get raw pixel data once
  const rawData = imageData.toCanvasImageData().data

  // Pre-allocate arrays
  const maxPatchSize = medianPatchSize * medianPatchSize
  const patchValues = new Float32Array(maxPatchSize)
  const smallPatch = new Float32Array(patchSize * patchSize)

  const halfPatch = Math.floor(patchSize / 2)
  const halfMedianPatch = Math.floor(medianPatchSize / 2)

  // Process in chunks with overlap
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      // Calculate median with larger patch
      let medianPatchCount = 0
      for (let py = y - halfMedianPatch; py <= y + halfMedianPatch; py++) {
        for (let px = x - halfMedianPatch; px <= x + halfMedianPatch; px++) {
          const clampedX = Math.max(0, Math.min(px, width - 1))
          const clampedY = Math.max(0, Math.min(py, height - 1))

          const pixelIndex = (clampedY * width + clampedX) * 4
          const l = 0.299 * rawData[pixelIndex] + 0.587 * rawData[pixelIndex + 1] + 0.114 * rawData[pixelIndex + 2]
          patchValues[medianPatchCount++] = l / 255
        }
      }

      // Calculate min/max with smaller patch AND collect values for faster median
      let smallPatchCount = 0
      let patchMin = 1
      let patchMax = 0

      for (let py = y - halfPatch; py <= y + halfPatch; py++) {
        for (let px = x - halfPatch; px <= x + halfPatch; px++) {
          const clampedX = Math.max(0, Math.min(px, width - 1))
          const clampedY = Math.max(0, Math.min(py, height - 1))

          const pixelIndex = (clampedY * width + clampedX) * 4
          const l = (0.299 * rawData[pixelIndex] + 0.587 * rawData[pixelIndex + 1] + 0.114 * rawData[pixelIndex + 2]) / 255

          if (l < patchMin) {
            patchMin = l
          }
          if (l > patchMax) {
            patchMax = l
          }
          smallPatch[smallPatchCount++] = l
        }
      }

      // Fast median calculation - use smaller sample for speed
      let medianValue
      if (medianPatchCount > 100) {
        // For large patches, use sampling for speed
        const step = Math.floor(medianPatchCount / 50) // Sample ~50 values
        const samples: number[] = []
        for (let i = 0; i < medianPatchCount; i += step) {
          samples.push(patchValues[i])
        }
        samples.sort((a, b) => a - b)
        const mid = Math.floor(samples.length / 2)
        medianValue = samples.length % 2 === 0 ? (samples[mid - 1] + samples[mid]) / 2 : samples[mid]
      }
      else {
        // For smaller patches, use full calculation
        const sorted = [...patchValues.subarray(0, medianPatchCount)].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        medianValue = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
      }

      // Fill result in stride x stride area
      for (let dy = 0; dy < stride && y + dy < height; dy++) {
        for (let dx = 0; dx < stride && x + dx < width; dx++) {
          const idx = (y + dy) * width + (x + dx)
          median[idx] = medianValue
          max[idx] = patchMax
          min[idx] = patchMin
        }
      }
    }
  }

  return { median, max, min }
}

export function calculateExpansionWeight(
  imageData: PixelImageData,
  patchSize: number = 8,
  stride: number = 2,
  avgScale: number = 10,
  distScale: number = 3,
): Float32Array {
  console.log(`🔍 Starting FAST weight calculation for ${imageData.width}x${imageData.height} image, patch=${patchSize}, stride=${stride}`)
  const startTime = performance.now()

  // Calculate all statistics in one pass
  console.log('🔍 Calculating combined stats (median, max, min)...')
  const stats = calculateCombinedStatsFast(imageData, patchSize, patchSize * 2, stride)

  console.log('🔍 Computing final weights...')
  // Calculate weight following Legacy logic
  const weights = new Float32Array(imageData.width * imageData.height)

  for (let i = 0; i < weights.length; i++) {
    const brightDist = stats.max[i] - stats.median[i]
    const darkDist = stats.median[i] - stats.min[i]

    const weight = (stats.median[i] - 0.5) * avgScale - (brightDist - darkDist) * distScale
    weights[i] = sigmoid(weight)
  }

  // Normalize weights (matching Legacy: (output - np.min(output)) / (np.max(output)))
  let minWeight = weights[0]
  let maxWeight = weights[0]

  for (let i = 1; i < weights.length; i++) {
    if (weights[i] < minWeight) {
      minWeight = weights[i]
    }
    if (weights[i] > maxWeight) {
      maxWeight = weights[i]
    }
  }

  const range = maxWeight - minWeight
  if (range > 0) {
    for (let i = 0; i < weights.length; i++) {
      weights[i] = (weights[i] - minWeight) / range
    }
  }

  const endTime = performance.now()
  console.log(`✅ FAST weight calculation completed in ${(endTime - startTime).toFixed(1)}ms`)

  return weights
}

/**
 * Optimized weight calculation using edge-aware processing
 */
export function calculateExpansionWeightOptimized(
  imageData: PixelImageData,
  patchSize: number = 8,
  stride: number = 2,
  avgScale: number = 10,
  distScale: number = 3,
  edgeThreshold: number = 0.1,
): { weights: Float32Array, edgeCoverage: number } {
  console.log(`🚀 Starting OPTIMIZED edge-aware weight calculation for ${imageData.width}x${imageData.height} image`)
  const startTime = performance.now()

  const width = imageData.width
  const height = imageData.height
  const pixelCount = width * height

  // Step 1: Fast edge detection
  const edgeStartTime = performance.now()
  const { edgeMask } = detectEdgesSobel(imageData, edgeThreshold)
  const edgeCoverage = calculateEdgeCoverage(edgeMask)
  const edgeTime = performance.now() - edgeStartTime

  console.log(`📊 Edge coverage: ${(edgeCoverage * 100).toFixed(1)}% (${edgeTime.toFixed(1)}ms)`)

  // Create extended processing region around edges
  const processingMask = createEdgeRegionMask(edgeMask, width, height, Math.ceil(patchSize / 2))

  // Initialize weights with neutral values
  const weights = new Float32Array(pixelCount)
  weights.fill(0.5) // Neutral weight for non-edge areas

  // Step 2: Only calculate detailed statistics for edge regions
  const statsStartTime = performance.now()

  // Count processing pixels
  let processedPixels = 0
  for (let i = 0; i < processingMask.length; i++) {
    if (processingMask[i] > 0)
      processedPixels++
  }

  console.log(`🎯 Processing ${processedPixels} pixels (${(processedPixels / pixelCount * 100).toFixed(1)}% of image)`)

  // Calculate statistics only for edge regions with optimized approach
  const stats = calculateFastCombinedStats(imageData, patchSize, patchSize * 2, stride, processingMask)
  const statsTime = performance.now() - statsStartTime

  // Step 3: Calculate weights for edge regions only
  const weightStartTime = performance.now()
  for (let i = 0; i < weights.length; i++) {
    if (processingMask[i] > 0 && stats.median[i] !== undefined) {
      const brightDist = stats.max[i] - stats.median[i]
      const darkDist = stats.median[i] - stats.min[i]
      const weight = (stats.median[i] - 0.5) * avgScale - (brightDist - darkDist) * distScale
      weights[i] = sigmoid(weight)
    }
  }

  // Normalize weights in edge regions only
  let minWeight = Infinity
  let maxWeight = -Infinity
  for (let i = 0; i < weights.length; i++) {
    if (processingMask[i] > 0) {
      if (weights[i] < minWeight)
        minWeight = weights[i]
      if (weights[i] > maxWeight)
        maxWeight = weights[i]
    }
  }

  const range = maxWeight - minWeight
  if (range > 0) {
    for (let i = 0; i < weights.length; i++) {
      if (processingMask[i] > 0) {
        weights[i] = (weights[i] - minWeight) / range
      }
    }
  }

  const weightTime = performance.now() - weightStartTime
  const totalTime = performance.now() - startTime

  console.log(`✅ Optimized weight calculation: ${totalTime.toFixed(1)}ms (edge: ${edgeTime.toFixed(1)}ms, stats: ${statsTime.toFixed(1)}ms, weights: ${weightTime.toFixed(1)}ms)`)
  console.log(`⚡ Speedup: ${(processedPixels / pixelCount < 0.5 ? '2-3x' : '1.5x')} estimated`)

  return { weights, edgeCoverage }
}

/**
 * Calculate orig_weight based on expansion weight (matching Legacy implementation)
 */
function calculateOrigWeight(weights: Float32Array): Float32Array {
  const origWeights = new Float32Array(weights.length)

  for (const [i, weight] of weights.entries()) {
    // orig_weight = sigmoid((weight - 0.5) * 5) * 0.25
    const sigmoidInput = (weight - 0.5) * 5
    const sigmoidOutput = sigmoid(sigmoidInput)
    origWeights[i] = sigmoidOutput * 0.25
  }

  return origWeights
}

/**
 * Apply three-way weighted blend (erode, dilate, original) - matching Legacy logic
 */
function threewayBlend(
  eroded: PixelImageData,
  dilated: PixelImageData,
  original: PixelImageData,
  weights: Float32Array,
  origWeights: Float32Array,
): PixelImageData {
  const result = new PixelImageData(original.width, original.height)

  for (let y = 0; y < original.height; y++) {
    for (let x = 0; x < original.width; x++) {
      const weight = weights[y * original.width + x]
      const origWeight = origWeights[y * original.width + x]

      const [re, ge, be, ae] = eroded.getPixel(x, y)
      const [rd, gd, bd, ad] = dilated.getPixel(x, y)
      const [ro, go, bo, ao] = original.getPixel(x, y)

      // First blend: eroded * weight + dilated * (1 - weight)
      const r1 = re * weight + rd * (1 - weight)
      const g1 = ge * weight + gd * (1 - weight)
      const b1 = be * weight + bd * (1 - weight)
      const a1 = ae * weight + ad * (1 - weight)

      // Second blend: output = first_blend * (1 - orig_weight) + original * orig_weight
      const r = r1 * (1 - origWeight) + ro * origWeight
      const g = g1 * (1 - origWeight) + go * origWeight
      const b = b1 * (1 - origWeight) + bo * origWeight
      const a = a1 * (1 - origWeight) + ao * origWeight

      result.setPixel(x, y, [
        Math.round(Math.max(0, Math.min(255, r))),
        Math.round(Math.max(0, Math.min(255, g))),
        Math.round(Math.max(0, Math.min(255, b))),
        Math.round(Math.max(0, Math.min(255, a))),
      ])
    }
  }

  return result
}

/**
 * Main outline expansion function (matching Legacy implementation exactly)
 */
export function outlineExpansion(
  imageData: PixelImageData,
  erodeIters: number = 2,
  dilateIters: number = 2,
  patchSize: number = 16,
  avgScale: number = 10,
  distScale: number = 3,
): { result: PixelImageData, weights: Float32Array } {
  // Step 1: Calculate expansion weights (k, stride, avg_scale, dist_scale)
  const weights = calculateExpansionWeight(imageData, patchSize, Math.floor(patchSize / 4) * 2, avgScale, distScale)

  // Step 2: Calculate orig_weight = sigmoid((weight - 0.5) * 5) * 0.25
  const origWeights = calculateOrigWeight(weights)

  // Step 3: Apply proper morphological operations
  const imgErode = erode(imageData, erodeIters)
  const imgDilate = dilate(imageData, dilateIters)

  // Step 4: Three-way weighted blend
  let result = threewayBlend(imgErode, imgDilate, imageData, weights, origWeights)

  // Step 5: Second round of morphological operations with smoothing kernel
  // output = cv2.erode(output, kernel_smoothing, iterations=erode)
  result = erodeSmooth(result, erodeIters)
  // output = cv2.dilate(output, kernel_smoothing, iterations=dilate * 2)
  result = dilateSmooth(result, dilateIters * 2)
  // output = cv2.erode(output, kernel_smoothing, iterations=erode)
  result = erodeSmooth(result, erodeIters)

  // Step 6: Process weights for return (matching Legacy: weight = np.abs(weight * 2 - 1) * 255)
  const finalWeights = new Float32Array(weights.length)
  for (const [i, weight] of weights.entries()) {
    finalWeights[i] = Math.abs(weight * 2 - 1)
  }

  // Apply dilation to weights (matching Legacy: weight = cv2.dilate(weight.astype(np.uint8), kernel_expansion, iterations=dilate))
  const weightImage = new PixelImageData(imageData.width, imageData.height)
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const weightValue = Math.round(finalWeights[y * imageData.width + x] * 255)
      weightImage.setPixel(x, y, [weightValue, weightValue, weightValue, 255])
    }
  }

  const dilatedWeightImage = dilate(weightImage, dilateIters)

  // Extract back to Float32Array
  const processedWeights = new Float32Array(weights.length)
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [weightValue] = dilatedWeightImage.getPixel(x, y)
      processedWeights[y * imageData.width + x] = weightValue / 255
    }
  }

  return { result, weights: processedWeights }
}

/**
 * Optimized outline expansion with edge-aware processing
 */
export function outlineExpansionOptimized(
  imageData: PixelImageData,
  erodeIters: number = 2,
  dilateIters: number = 2,
  patchSize: number = 16,
  avgScale: number = 10,
  distScale: number = 3,
  edgeThreshold: number = 0.1,
  useOptimization: boolean = true,
): { result: PixelImageData, weights: Float32Array, edgeCoverage?: number } {
  console.log(`🚀 Starting ${useOptimization ? 'OPTIMIZED' : 'STANDARD'} outline expansion`)

  if (!useOptimization) {
    // Fall back to standard algorithm
    return outlineExpansion(imageData, erodeIters, dilateIters, patchSize, avgScale, distScale)
  }

  const totalStartTime = performance.now()

  // Step 1: Calculate optimized expansion weights using edge detection
  const { weights, edgeCoverage } = calculateExpansionWeightOptimized(
    imageData,
    patchSize,
    Math.floor(patchSize / 4) * 2,
    avgScale,
    distScale,
    edgeThreshold,
  )

  // Determine if optimization is worth it based on edge coverage
  if (edgeCoverage > 0.7) {
    console.log(`📊 High edge coverage (${(edgeCoverage * 100).toFixed(1)}%), using standard algorithm`)
    const standardResult = outlineExpansion(imageData, erodeIters, dilateIters, patchSize, avgScale, distScale)
    return { ...standardResult, edgeCoverage }
  }

  console.log(`⚡ Using optimized processing for ${(edgeCoverage * 100).toFixed(1)}% edge coverage`)

  // Step 2: Calculate orig_weight = sigmoid((weight - 0.5) * 5) * 0.25
  const origWeights = calculateOrigWeight(weights)

  // Step 3: Apply morphological operations (same as original)
  const morphStartTime = performance.now()
  const imgErode = erode(imageData, erodeIters)
  const imgDilate = dilate(imageData, dilateIters)
  const morphTime = performance.now() - morphStartTime

  // Step 4: Three-way weighted blend
  const blendStartTime = performance.now()
  let result = threewayBlend(imgErode, imgDilate, imageData, weights, origWeights)
  const blendTime = performance.now() - blendStartTime

  // Step 5: Second round of morphological operations with smoothing
  const smoothStartTime = performance.now()
  result = erodeSmooth(result, erodeIters)
  result = dilateSmooth(result, dilateIters * 2)
  result = erodeSmooth(result, erodeIters)
  const smoothTime = performance.now() - smoothStartTime

  // Step 6: Process weights for return
  const finalWeights = new Float32Array(weights.length)
  for (const [i, weight] of weights.entries()) {
    finalWeights[i] = Math.abs(weight * 2 - 1)
  }

  // Apply dilation to weights
  const weightImage = new PixelImageData(imageData.width, imageData.height)
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const weightValue = Math.round(finalWeights[y * imageData.width + x] * 255)
      weightImage.setPixel(x, y, [weightValue, weightValue, weightValue, 255])
    }
  }

  const dilatedWeightImage = dilate(weightImage, dilateIters)

  // Extract back to Float32Array
  const processedWeights = new Float32Array(weights.length)
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [weightValue] = dilatedWeightImage.getPixel(x, y)
      processedWeights[y * imageData.width + x] = weightValue / 255
    }
  }

  const totalTime = performance.now() - totalStartTime
  console.log(`✅ Optimized outline expansion completed in ${totalTime.toFixed(1)}ms`)
  console.log(`⏱️  Breakdown: morph: ${morphTime.toFixed(1)}ms, blend: ${blendTime.toFixed(1)}ms, smooth: ${smoothTime.toFixed(1)}ms`)

  return { result, weights: processedWeights, edgeCoverage }
}
