import { clamp } from '../utils/math'
import { PixelImageData } from './imageData'
import type { ColorPalette } from './palettes'
import { findNearestColorInPalette } from './palettes'

/**
 * Color quantization utilities
 */

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
 * Generate initial centroids using min-max interpolation
 * Based on centroid_generator from Python version
 */
export function generateCentroids(
  pixels: number[][],
  numCentroids: number,
): number[][] {
  if (pixels.length === 0) {
    return []
  }

  // Find min and max values for each channel
  const numChannels = pixels[0].length
  const minValues = new Array(numChannels).fill(255)
  const maxValues = new Array(numChannels).fill(0)

  for (const pixel of pixels) {
    for (let c = 0; c < numChannels; c++) {
      minValues[c] = Math.min(minValues[c], pixel[c])
      maxValues[c] = Math.max(maxValues[c], pixel[c])
    }
  }

  const centroids: number[][] = []

  if (numCentroids < 8) {
    // Simple linear interpolation for small number of centroids
    for (let i = 0; i < numCentroids; i++) {
      const t = i / (numCentroids - 1)
      const centroid: number[] = []
      for (let c = 0; c < numChannels; c++) {
        centroid[c] = minValues[c] + t * (maxValues[c] - minValues[c])
      }
      centroids.push(centroid)
    }
  }
  else {
    // More sophisticated initialization for larger number of centroids
    const baseNum = Math.floor(numCentroids / 4)
    const centNum = numCentroids - baseNum * 3

    // Create base centroids along each channel
    for (let c = 0; c < numChannels; c++) {
      for (let i = 1; i <= baseNum; i++) {
        const t = i / (baseNum + 1)
        const centroid = [...minValues]
        centroid[c] = minValues[c] + t * (maxValues[c] - minValues[c])
        centroids.push(centroid)
      }
    }

    // Add central interpolated centroids
    for (let i = 0; i < centNum; i++) {
      const t = i / (centNum - 1)
      const centroid: number[] = []
      for (let c = 0; c < numChannels; c++) {
        centroid[c] = minValues[c] + t * (maxValues[c] - minValues[c])
      }
      centroids.push(centroid)
    }
  }

  return centroids
}

/**
 * Find the nearest centroid for a given pixel
 */
export function findNearestCentroid(
  pixel: number[],
  centroids: number[][],
): number {
  let minDistance = Infinity
  let nearestIndex = 0

  for (const [i, centroid] of centroids.entries()) {
    let distance = 0
    for (const [c, element] of pixel.entries()) {
      const diff = element - centroid[c]
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
 * Find the nearest palette color for a given pixel
 */
export function findNearestPaletteColor(
  pixel: number[],
  palette: number[][],
): number[] {
  const nearestIndex = findNearestCentroid(pixel, palette)
  return [...palette[nearestIndex]]
}

/**
 * Find the two nearest colors in the palette and return interpolation ratio
 */
export function findNearestPaletteColorsWithDistance(
  pixel: number[],
  palette: number[][],
): {
  color1: number[]
  color2: number[]
  distRatio: number
} {
  if (palette.length < 2) {
    return {
      color1: [...palette[0]],
      color2: [...palette[0]],
      distRatio: 0,
    }
  }

  // Calculate distances to all palette colors
  const distances = palette.map((color) => {
    let distance = 0
    for (const [c, element] of pixel.entries()) {
      const diff = element - color[c]
      distance += diff * diff
    }
    return Math.sqrt(distance)
  })

  // Find two closest colors
  let firstIndex = 0
  let secondIndex = 1

  if (distances[1] < distances[0]) {
    [firstIndex, secondIndex] = [secondIndex, firstIndex]
  }

  for (let i = 2; i < distances.length; i++) {
    if (distances[i] < distances[firstIndex]) {
      secondIndex = firstIndex
      firstIndex = i
    }
    else if (distances[i] < distances[secondIndex]) {
      secondIndex = i
    }
  }

  const firstDist = distances[firstIndex]
  const secondDist = distances[secondIndex]
  const totalDist = firstDist + secondDist
  const distRatio = totalDist > 0 ? firstDist / totalDist : 0

  return {
    color1: [...palette[firstIndex]],
    color2: [...palette[secondIndex]],
    distRatio,
  }
}

/**
 * Perform one iteration of K-means clustering
 */
export function kMeansIteration(
  pixels: number[][],
  centroids: number[][],
  weights?: number[],
): { newCentroids: number[][], totalChange: number } {
  const numCentroids = centroids.length
  const numChannels = centroids[0].length

  // Assign pixels to nearest centroids
  const assignments: number[] = []
  for (const pixel of pixels) {
    assignments.push(findNearestCentroid(pixel, centroids))
  }

  // Calculate new centroids
  const newCentroids: number[][] = []
  const counts = new Array(numCentroids).fill(0)
  const sums = new Array(numCentroids).fill(null).map(() => new Array(numChannels).fill(0))

  for (const [i, pixel] of pixels.entries()) {
    const assignment = assignments[i]
    const weight = weights ? weights[i] : 1
    counts[assignment] += weight

    for (let c = 0; c < numChannels; c++) {
      sums[assignment][c] += pixel[c] * weight
    }
  }

  // Compute new centroids
  let totalChange = 0
  for (let i = 0; i < numCentroids; i++) {
    const newCentroid: number[] = []

    if (counts[i] > 0) {
      for (let c = 0; c < numChannels; c++) {
        newCentroid[c] = sums[i][c] / counts[i]
      }
    }
    else {
      // If no pixels assigned, keep old centroid
      newCentroid.push(...centroids[i])
    }

    // Calculate change
    for (let c = 0; c < numChannels; c++) {
      totalChange += Math.abs(newCentroid[c] - centroids[i][c])
    }

    newCentroids.push(newCentroid)
  }

  return { newCentroids, totalChange }
}

/**
 * K-means color quantization
 * Based on color_quantization_kmeans from Python version
 */
export function colorQuantizationKMeans(
  imageData: PixelImageData,
  options: QuantizationOptions,
): QuantizationResult {
  const { numCentroids, maxIterations = 50, convergenceThreshold = 1 / 256 } = options

  // Extract pixels
  const pixels: number[][] = []
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [r, g, b] = imageData.getPixel(x, y)
      pixels.push([r, g, b])
    }
  }

  // Initialize centroids
  let centroids = generateCentroids(pixels, numCentroids)

  // Run K-means iterations
  for (let iter = 0; iter < maxIterations; iter++) {
    const { newCentroids, totalChange } = kMeansIteration(pixels, centroids, options.weights)
    centroids = newCentroids

    // Check for convergence
    if (totalChange < convergenceThreshold) {
      break
    }
  }

  // Create quantized image
  const quantized = new PixelImageData(imageData.width, imageData.height)
  const labels: number[] = []

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [r, g, b, a] = imageData.getPixel(x, y)
      const nearestColor = findNearestPaletteColor([r, g, b], centroids)
      quantized.setPixel(x, y, [nearestColor[0], nearestColor[1], nearestColor[2], a])
      labels.push(findNearestCentroid([r, g, b], centroids))
    }
  }

  return { quantized, centroids, labels }
}

/**
 * Internal dithering implementation to avoid circular dependencies
 */
function applyDitheringInternal(
  imageData: PixelImageData,
  palette: number[][],
  method: 'ordered' | 'error_diffusion',
): PixelImageData {
  if (method === 'ordered') {
    return orderedDitherInternal(imageData, palette, 8)
  }
  else if (method === 'error_diffusion') {
    return errorDiffusionDitherInternal(imageData, palette)
  }

  return imageData.clone()
}

/**
 * Internal ordered dither implementation
 */
function orderedDitherInternal(
  imageData: PixelImageData,
  palette: number[][],
  patternSize: number = 8,
): PixelImageData {
  const result = new PixelImageData(imageData.width, imageData.height)

  // Generate simplified Bayer matrix
  const bayerMatrix = generateBayerMatrixInternal(patternSize)

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [r, g, b, a] = imageData.getPixel(x, y)
      const threshold = bayerMatrix[y % patternSize][x % patternSize]

      // Find nearest palette color
      const nearestColor = findNearestPaletteColor([r, g, b], palette)
      
      // Calculate luminance-based dithering
      const originalLum = 0.299 * r + 0.587 * g + 0.114 * b
      const quantizedLum = 0.299 * nearestColor[0] + 0.587 * nearestColor[1] + 0.114 * nearestColor[2]
      
      // Apply dithering noise based on threshold and luminance difference
      const error = originalLum - quantizedLum
      const noise = (threshold - 0.5) * 64 // Scale threshold to noise range
      
      // Add noise to original color before requantizing
      const ditheredR = Math.round(Math.max(0, Math.min(255, r + error * 0.3 + noise)))
      const ditheredG = Math.round(Math.max(0, Math.min(255, g + error * 0.3 + noise)))
      const ditheredB = Math.round(Math.max(0, Math.min(255, b + error * 0.3 + noise)))
      
      // Final quantization with dithered color
      const finalColor = findNearestPaletteColor([ditheredR, ditheredG, ditheredB], palette)
      result.setPixel(x, y, [finalColor[0], finalColor[1], finalColor[2], a])
    }
  }

  return result
}

/**
 * Internal error diffusion dither implementation
 */
function errorDiffusionDitherInternal(
  imageData: PixelImageData,
  palette: number[][],
): PixelImageData {
  const result = imageData.clone()

  // Floyd-Steinberg error diffusion kernel
  const errorKernel = [
    { dx: 1, dy: 0, weight: 7 / 16 }, // right
    { dx: -1, dy: 1, weight: 3 / 16 }, // bottom-left
    { dx: 0, dy: 1, weight: 5 / 16 }, // bottom
    { dx: 1, dy: 1, weight: 1 / 16 }, // bottom-right
  ]

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [r, g, b, a] = result.getPixel(x, y)

      // Find nearest palette color
      const quantizedColor = findNearestPaletteColor([r, g, b], palette)

      // Set quantized color
      result.setPixel(x, y, [quantizedColor[0], quantizedColor[1], quantizedColor[2], a])

      // Calculate error
      const errorR = r - quantizedColor[0]
      const errorG = g - quantizedColor[1]
      const errorB = b - quantizedColor[2]

      // Diffuse error to neighboring pixels
      for (const { dx, dy, weight } of errorKernel) {
        const nx = x + dx
        const ny = y + dy

        // Check bounds
        if (nx >= 0 && nx < imageData.width && ny >= 0 && ny < imageData.height) {
          const [nr, ng, nb, na] = result.getPixel(nx, ny)

          // Add weighted error
          const newR = clamp(nr + errorR * weight, 0, 255)
          const newG = clamp(ng + errorG * weight, 0, 255)
          const newB = clamp(nb + errorB * weight, 0, 255)

          result.setPixel(nx, ny, [newR, newG, newB, na])
        }
      }
    }
  }

  return result
}

/**
 * Generate proper Bayer matrix using recursive construction
 */
function generateBayerMatrixInternal(n: number): number[][] {
  if (n === 2) {
    return [
      [0 / 4, 2 / 4],
      [3 / 4, 1 / 4],
    ]
  }
  else if (n === 4) {
    return [
      [0 / 16, 8 / 16, 2 / 16, 10 / 16],
      [12 / 16, 4 / 16, 14 / 16, 6 / 16],
      [3 / 16, 11 / 16, 1 / 16, 9 / 16],
      [15 / 16, 7 / 16, 13 / 16, 5 / 16],
    ]
  }
  else if (n === 8) {
    // Proper 8x8 Bayer matrix
    return [
      [0, 32, 8, 40, 2, 34, 10, 42],
      [48, 16, 56, 24, 50, 18, 58, 26],
      [12, 44, 4, 36, 14, 46, 6, 38],
      [60, 28, 52, 20, 62, 30, 54, 22],
      [3, 35, 11, 43, 1, 33, 9, 41],
      [51, 19, 59, 27, 49, 17, 57, 25],
      [15, 47, 7, 39, 13, 45, 5, 37],
      [63, 31, 55, 23, 61, 29, 53, 21]
    ].map(row => row.map(val => val / 64))
  }
  else {
    // For other sizes, use recursive Bayer matrix construction
    return generateRecursiveBayerMatrix(n)
  }
}

/**
 * Generate Bayer matrix recursively for any power of 2 size
 */
function generateRecursiveBayerMatrix(n: number): number[][] {
  // Find the nearest power of 2
  let size = 2
  while (size < n) size *= 2
  
  // Start with 2x2 base case
  let matrix = [
    [0, 2],
    [3, 1]
  ]
  
  // Recursively build larger matrices
  while (matrix.length < size) {
    const oldSize = matrix.length
    const newSize = oldSize * 2
    const newMatrix: number[][] = []
    
    for (let i = 0; i < newSize; i++) {
      newMatrix[i] = []
      for (let j = 0; j < newSize; j++) {
        const quadrant = Math.floor(i / oldSize) * 2 + Math.floor(j / oldSize)
        const baseValue = matrix[i % oldSize][j % oldSize]
        const offset = quadrant * oldSize * oldSize
        newMatrix[i][j] = baseValue + offset
      }
    }
    
    matrix = newMatrix
  }
  
  // Normalize to [0, 1] range
  const maxValue = size * size - 1
  return matrix.map(row => row.map(val => val / (maxValue + 1)))
}


/**
 * Apply quantization with predefined palette
 */
export function quantizeToPalette(
  imageData: PixelImageData,
  palette: ColorPalette,
  ditherMethod: 'none' | 'ordered' | 'error_diffusion' = 'none',
): PixelImageData {
  if (ditherMethod === 'none') {
    // Simple quantization without dithering
    const result = new PixelImageData(imageData.width, imageData.height)

    for (let y = 0; y < imageData.height; y++) {
      for (let x = 0; x < imageData.width; x++) {
        const [r, g, b, a] = imageData.getPixel(x, y)
        const quantizedColor = findNearestColorInPalette([r, g, b], palette.colors)
        result.setPixel(x, y, [
          Math.round(clamp(quantizedColor[0], 0, 255)),
          Math.round(clamp(quantizedColor[1], 0, 255)),
          Math.round(clamp(quantizedColor[2], 0, 255)),
          a,
        ])
      }
    }

    return result
  }
  else {
    // Apply dithering with predefined palette
    return applyDitheringInternal(imageData, palette.colors, ditherMethod)
  }
}

/**
 * Apply quantization and dithering combined (with weights support)
 */
export function quantizeAndDither(
  imageData: PixelImageData,
  numCentroids: number = 32,
  ditherMethod: 'none' | 'ordered' | 'error_diffusion' = 'none',
  weights?: Float32Array,
): PixelImageData {
  // Prepare weights array if provided
  let weightsArray: number[] | undefined
  if (weights) {
    weightsArray = [...weights]
  }

  // First perform K-means quantization (with weights if available)
  const { centroids } = colorQuantizationKMeans(imageData, {
    numCentroids,
    weights: weightsArray,
  })

  // Apply dithering with the generated palette
  if (ditherMethod === 'none') {
    // Simple quantization without dithering
    const result = new PixelImageData(imageData.width, imageData.height)

    for (let y = 0; y < imageData.height; y++) {
      for (let x = 0; x < imageData.width; x++) {
        const [r, g, b, a] = imageData.getPixel(x, y)
        const quantizedColor = findNearestPaletteColor([r, g, b], centroids)
        result.setPixel(x, y, [
          Math.round(clamp(quantizedColor[0], 0, 255)),
          Math.round(clamp(quantizedColor[1], 0, 255)),
          Math.round(clamp(quantizedColor[2], 0, 255)),
          a,
        ])
      }
    }

    return result
  }
  else {
    // Apply dithering directly here to avoid dependency issues
    return applyDitheringInternal(imageData, centroids, ditherMethod)
  }
}
