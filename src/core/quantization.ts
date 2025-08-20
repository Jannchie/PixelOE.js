import { clamp } from '../utils/math'
import { PixelImageData } from './imageData'

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

      // Find two nearest colors and their distance ratio
      const { color1, color2, distRatio } = findNearestPaletteColorsWithDistanceInternal([r, g, b], palette)

      // Choose between color1 and color2 based on threshold
      let finalColor: number[]
      finalColor = threshold > distRatio ? color1 : color2

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
 * Generate simple Bayer matrix
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
  else {
    // For n=8 or larger, use a simplified pattern
    const matrix: number[][] = []
    for (let y = 0; y < n; y++) {
      matrix[y] = []
      for (let x = 0; x < n; x++) {
        matrix[y][x] = ((x + y * n) % (n * n)) / (n * n)
      }
    }
    return matrix
  }
}

/**
 * Internal implementation of nearest colors with distance
 */
function findNearestPaletteColorsWithDistanceInternal(
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
