import { clamp } from '../utils/math'
import { PixelImageData } from './imageData'
import { findNearestPaletteColor, findNearestPaletteColorsWithDistance } from './quantization'

/**
 * Dithering algorithms for color quantization
 */

export type DitherMethod = 'none' | 'ordered' | 'error_diffusion'

/**
 * Generate Bayer dithering matrix of size n x n
 * Based on _generate_bayer_matrix from Python version
 */
export function generateBayerMatrix(n: number): number[][] {
  if (n === 2) {
    return [
      [0, 2],
      [3, 1],
    ]
  }

  const smaller = generateBayerMatrix(n / 2)
  const smallerSize = smaller.length
  const result: number[][] = []

  // Initialize result matrix
  for (let i = 0; i < n; i++) {
    result[i] = new Array(n)
  }

  // Fill quadrants
  for (let i = 0; i < smallerSize; i++) {
    for (let j = 0; j < smallerSize; j++) {
      const val = smaller[i][j]

      // Top-left: 4 * smaller
      result[i][j] = 4 * val

      // Top-right: 4 * smaller + 2
      result[i][j + smallerSize] = 4 * val + 2

      // Bottom-left: 4 * smaller + 3
      result[i + smallerSize][j] = 4 * val + 3

      // Bottom-right: 4 * smaller + 1
      result[i + smallerSize][j + smallerSize] = 4 * val + 1
    }
  }

  return result
}

/**
 * Get normalized Bayer matrix (values between 0 and 1)
 */
export function getNormalizedBayerMatrix(n: number): number[][] {
  const matrix = generateBayerMatrix(n)
  const normalizer = n * n

  return matrix.map(row =>
    row.map(val => val / normalizer),
  )
}

/**
 * Create repeated pattern to cover entire image
 */
function createRepeatedPattern(
  pattern: number[][],
  width: number,
  height: number,
): number[][] {
  const patternHeight = pattern.length
  const patternWidth = pattern[0].length
  const result: number[][] = []

  for (let y = 0; y < height; y++) {
    result[y] = []
    for (let x = 0; x < width; x++) {
      const patternY = y % patternHeight
      const patternX = x % patternWidth
      result[y][x] = pattern[patternY][patternX]
    }
  }

  return result
}

/**
 * Ordered dithering using Bayer matrix
 * Based on ordered_dither from Python version
 */
export function orderedDither(
  imageData: PixelImageData,
  palette: number[][],
  patternSize: number = 8,
): PixelImageData {
  const result = new PixelImageData(imageData.width, imageData.height)

  // Generate Bayer matrix
  const bayerMatrix = getNormalizedBayerMatrix(patternSize)

  // Create repeated pattern to cover the entire image
  const thresholdPattern = createRepeatedPattern(
    bayerMatrix,
    imageData.width,
    imageData.height,
  )

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [r, g, b, a] = imageData.getPixel(x, y)
      const threshold = thresholdPattern[y][x]

      // Find two nearest colors and their distance ratio
      const { color1, color2, distRatio } = findNearestPaletteColorsWithDistance(
        [r, g, b],
        palette,
      )

      // Choose between color1 and color2 based on threshold and distance ratio
      let finalColor: number[]
      finalColor = threshold > distRatio ? color1 : color2

      result.setPixel(x, y, [finalColor[0], finalColor[1], finalColor[2], a])
    }
  }

  return result
}

/**
 * Error diffusion dithering using Floyd-Steinberg kernel
 * Based on parallel_error_diffusion from Python version
 */
export function errorDiffusionDither(
  imageData: PixelImageData,
  palette: number[][],
): PixelImageData {
  const result = imageData.clone()

  // Floyd-Steinberg error diffusion kernel
  // Normalized weights: [7, 3, 5, 1] / 16
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
 * Apply dithering with the specified method
 */
export function applyDithering(
  imageData: PixelImageData,
  palette: number[][],
  method: DitherMethod = 'none',
  patternSize: number = 8,
): PixelImageData {
  switch (method) {
    case 'ordered': {
      return orderedDither(imageData, palette, patternSize)
    }

    case 'error_diffusion': {
      return errorDiffusionDither(imageData, palette)
    }

    case 'none':
    default: {
      // Apply simple quantization without dithering
      const result = new PixelImageData(imageData.width, imageData.height)

      for (let y = 0; y < imageData.height; y++) {
        for (let x = 0; x < imageData.width; x++) {
          const [r, g, b, a] = imageData.getPixel(x, y)
          const quantizedColor = findNearestPaletteColor([r, g, b], palette)
          result.setPixel(x, y, [quantizedColor[0], quantizedColor[1], quantizedColor[2], a])
        }
      }

      return result
    }
  }
}

/**
 * Optimized error diffusion with parallel processing for even rows
 * Based on the parallel approach in Python version
 */
export function parallelErrorDiffusion(
  imageData: PixelImageData,
  palette: number[][],
): PixelImageData {
  const result = imageData.clone()
  const width = imageData.width
  const height = imageData.height

  // Error diffusion kernel (normalized)
  const kernel = [
    [0, 0, 7 / 16],
    [3 / 16, 5 / 16, 1 / 16],
  ]

  // Process image in chunks to enable some parallelization
  for (let y = 0; y < height; y += 2) {
    // Process current row
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = result.getPixel(x, y)
      const quantizedColor = findNearestPaletteColor([r, g, b], palette)

      result.setPixel(x, y, [quantizedColor[0], quantizedColor[1], quantizedColor[2], a])

      // Calculate error
      const errorR = r - quantizedColor[0]
      const errorG = g - quantizedColor[1]
      const errorB = b - quantizedColor[2]

      // Diffuse error using kernel
      for (const [ky, element] of kernel.entries()) {
        for (const [kx, weight] of element.entries()) {
          if (weight === 0) {
            continue
          }

          const nx = x + kx - 1 // Center kernel at position 1
          const ny = y + ky

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const [nr, ng, nb, na] = result.getPixel(nx, ny)

            const newR = clamp(nr + errorR * weight, 0, 255)
            const newG = clamp(ng + errorG * weight, 0, 255)
            const newB = clamp(nb + errorB * weight, 0, 255)

            result.setPixel(nx, ny, [newR, newG, newB, na])
          }
        }
      }
    }

    // Process next row if it exists
    if (y + 1 < height) {
      for (let x = 0; x < width; x++) {
        const [r, g, b, a] = result.getPixel(x, y + 1)
        const quantizedColor = findNearestPaletteColor([r, g, b], palette)
        result.setPixel(x, y + 1, [quantizedColor[0], quantizedColor[1], quantizedColor[2], a])
      }
    }
  }

  return result
}
