/**
 * Optimized color quantization utilities
 */
import { PixelImageData } from './imageData'
import { clamp } from '../utils/math'

export interface QuantizationOptions {
  numCentroids: number
  maxIterations?: number
  convergenceThreshold?: number
  weights?: number[]
}

export interface QuantizationResult {
  quantized: PixelImageData
  centroids: number[][]
  labels: number[]
}

/**
 * Optimized nearest centroid finding using squared distance
 * Avoids expensive sqrt calls
 */
export function findNearestCentroidOptimized(
  pixel: number[],
  centroids: number[][]
): number {
  let minDistance = Infinity
  let nearestIndex = 0

  for (let i = 0; i < centroids.length; i++) {
    let distance = 0
    
    // Use squared distance to avoid sqrt
    const centroid = centroids[i]
    for (let c = 0; c < pixel.length; c++) {
      const diff = pixel[c] - centroid[c]
      distance += diff * diff
    }

    if (distance < minDistance) {
      minDistance = distance
      nearestIndex = i
    }
  }

  return nearestIndex
}

/**
 * Batch nearest centroid finding for multiple pixels
 * More cache-friendly memory access patterns
 */
export function batchFindNearestCentroids(
  pixels: number[][],
  centroids: number[][]
): number[] {
  const result = new Array(pixels.length)
  const numChannels = pixels[0]?.length || 3
  const numCentroids = centroids.length
  
  // Pre-calculate squared distances for better cache usage
  for (let i = 0; i < pixels.length; i++) {
    const pixel = pixels[i]
    let minDistance = Infinity
    let nearestIndex = 0

    for (let j = 0; j < numCentroids; j++) {
      let distance = 0
      const centroid = centroids[j]
      
      // Unroll loop for common case of RGB (3 channels)
      if (numChannels === 3) {
        const dr = pixel[0] - centroid[0]
        const dg = pixel[1] - centroid[1]
        const db = pixel[2] - centroid[2]
        distance = dr * dr + dg * dg + db * db
      } else {
        // General case for other channel counts
        for (let c = 0; c < numChannels; c++) {
          const diff = pixel[c] - centroid[c]
          distance += diff * diff
        }
      }

      if (distance < minDistance) {
        minDistance = distance
        nearestIndex = j
      }
    }
    
    result[i] = nearestIndex
  }

  return result
}

/**
 * Optimized palette color finding with early termination
 */
export function findNearestPaletteColorOptimized(
  pixel: number[],
  palette: number[][]
): number[] {
  const nearestIndex = findNearestCentroidOptimized(pixel, palette)
  // Direct access is faster than spreading for small arrays
  const nearest = palette[nearestIndex]
  return [nearest[0], nearest[1], nearest[2]]
}

/**
 * Fast distance calculation with SIMD-like optimization
 * Uses TypedArrays for better performance
 */
export function fastDistanceCalculation(
  pixel: Float32Array,
  centroids: Float32Array[],
  channelCount: number = 3
): number {
  let minDistance = Infinity
  let nearestIndex = 0

  for (let i = 0; i < centroids.length; i++) {
    let distance = 0
    const centroid = centroids[i]
    
    // Vectorized calculation for better performance
    for (let c = 0; c < channelCount; c++) {
      const diff = pixel[c] - centroid[c]
      distance += diff * diff
    }

    if (distance < minDistance) {
      minDistance = distance
      nearestIndex = i
    }
  }

  return nearestIndex
}

/**
 * Optimized K-means iteration with batch processing
 */
export function kMeansIterationOptimized(
  pixels: number[][],
  centroids: number[][],
  weights?: number[]
): { newCentroids: number[][]; totalChange: number } {
  const numCentroids = centroids.length
  const numChannels = centroids[0].length

  // Use batch processing for assignments
  const assignments = batchFindNearestCentroids(pixels, centroids)

  // Pre-allocate arrays for better performance
  const newCentroids: number[][] = new Array(numCentroids)
  const counts = new Float32Array(numCentroids)
  const sums = new Array(numCentroids)
  
  for (let i = 0; i < numCentroids; i++) {
    sums[i] = new Float32Array(numChannels)
    newCentroids[i] = new Array(numChannels)
  }

  // Accumulate sums and counts
  for (let i = 0; i < pixels.length; i++) {
    const assignment = assignments[i]
    const weight = weights ? weights[i] : 1
    counts[assignment] += weight
    
    const pixel = pixels[i]
    const sum = sums[assignment]
    for (let c = 0; c < numChannels; c++) {
      sum[c] += pixel[c] * weight
    }
  }

  // Compute new centroids and calculate change
  let totalChange = 0
  for (let i = 0; i < numCentroids; i++) {
    if (counts[i] > 0) {
      const sum = sums[i]
      const count = counts[i]
      
      for (let c = 0; c < numChannels; c++) {
        const newValue = sum[c] / count
        totalChange += Math.abs(newValue - centroids[i][c])
        newCentroids[i][c] = newValue
      }
    } else {
      // Keep old centroid if no pixels assigned
      for (let c = 0; c < numChannels; c++) {
        newCentroids[i][c] = centroids[i][c]
      }
    }
  }

  return { newCentroids, totalChange }
}

/**
 * Optimized centroid generation with better initialization
 */
export function generateCentroidsOptimized(
  pixels: number[][],
  numCentroids: number
): number[][] {
  if (pixels.length === 0) return []
  if (numCentroids <= 0) return []

  const numChannels = pixels[0].length
  
  // Use kmeans++ initialization for better starting points
  const centroids: number[][] = []
  
  // Choose first centroid randomly
  const firstIdx = Math.floor(Math.random() * pixels.length)
  centroids.push([...pixels[firstIdx]])
  
  // Choose remaining centroids using kmeans++ algorithm
  for (let i = 1; i < numCentroids; i++) {
    const distances = new Float32Array(pixels.length)
    let totalDistance = 0
    
    // Calculate distance to nearest existing centroid for each pixel
    for (let j = 0; j < pixels.length; j++) {
      let minDist = Infinity
      const pixel = pixels[j]
      
      for (const centroid of centroids) {
        let dist = 0
        for (let c = 0; c < numChannels; c++) {
          const diff = pixel[c] - centroid[c]
          dist += diff * diff
        }
        minDist = Math.min(minDist, dist)
      }
      
      distances[j] = minDist
      totalDistance += minDist
    }
    
    // Choose next centroid with probability proportional to squared distance
    let randomValue = Math.random() * totalDistance
    for (let j = 0; j < pixels.length; j++) {
      randomValue -= distances[j]
      if (randomValue <= 0) {
        centroids.push([...pixels[j]])
        break
      }
    }
  }
  
  return centroids
}

/**
 * Optimized K-means quantization with all improvements
 */
export function colorQuantizationKMeansOptimized(
  imageData: PixelImageData,
  options: QuantizationOptions
): QuantizationResult {
  const { numCentroids, maxIterations = 50, convergenceThreshold = 1/256 } = options

  // Extract pixels more efficiently
  const pixels: number[][] = []
  const width = imageData.width
  const height = imageData.height
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = imageData.getPixel(x, y)
      pixels.push([r, g, b])
    }
  }

  // Use optimized initialization
  let centroids = generateCentroidsOptimized(pixels, numCentroids)

  // Run optimized K-means iterations
  for (let iter = 0; iter < maxIterations; iter++) {
    const { newCentroids, totalChange } = kMeansIterationOptimized(centroids, centroids, options.weights)
    centroids = newCentroids

    // Check for convergence
    if (totalChange < convergenceThreshold) {
      break
    }
  }

  // Create quantized image using batch processing
  const quantized = new PixelImageData(width, height)
  const labels = batchFindNearestCentroids(pixels, centroids)
  
  let pixelIndex = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [, , , a] = imageData.getPixel(x, y)
      const centroidIndex = labels[pixelIndex]
      const [r, g, b] = centroids[centroidIndex]
      
      quantized.setPixel(x, y, [
        Math.round(clamp(r, 0, 255)),
        Math.round(clamp(g, 0, 255)), 
        Math.round(clamp(b, 0, 255)),
        a
      ])
      pixelIndex++
    }
  }

  return { quantized, centroids, labels }
}

/**
 * Optimized quantization and dithering function
 */
export function quantizeAndDitherOptimized(
  imageData: PixelImageData,
  numCentroids: number = 32,
  ditherMethod: 'none' | 'ordered' | 'error_diffusion' = 'none',
  weights?: Float32Array
): PixelImageData {
  // Prepare weights array if provided
  let weightsArray: number[] | undefined;
  if (weights) {
    weightsArray = Array.from(weights);
  }

  // Perform K-means quantization with optimized version
  const { quantized } = colorQuantizationKMeansOptimized(imageData, {
    numCentroids,
    maxIterations: 20,
    weights: weightsArray
  });

  // Apply dithering if requested
  if (ditherMethod === 'none') {
    return quantized;
  }

  // For now, return quantized without dithering
  // (dithering optimization can be added later if needed)
  return quantized;
}