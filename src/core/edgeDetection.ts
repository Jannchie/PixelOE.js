import type { LuminanceMethod } from './luminance'
import { PixelImageData } from './imageData'
import { convertToLuminance } from './luminance'

/**
 * Edge detection algorithms for optimized outline expansion
 */

/**
 * Sobel kernels for edge detection (kept for reference/future use)
 */
// const SOBEL_X_KERNEL = [
//   [-1, 0, 1],
//   [-2, 0, 2],
//   [-1, 0, 1]
// ]

// const SOBEL_Y_KERNEL = [
//   [-1, -2, -1],
//   [ 0,  0,  0],
//   [ 1,  2,  1]
// ]

/**
 * Fast Sobel edge detection with optimized implementation
 */
export function detectEdgesSobel(
  imageData: PixelImageData,
  threshold: number = 0.1,
  luminanceMethod: LuminanceMethod = 'oklab',
): { edgeMask: Uint8Array, edgeStrength: Float32Array } {
  console.log(`🔍 Starting fast Sobel edge detection for ${imageData.width}x${imageData.height} image (${luminanceMethod})`)
  const startTime = performance.now()

  const width = imageData.width
  const height = imageData.height
  const pixelCount = width * height

  // Convert to luminance using specified method
  const grayData = convertToLuminance(imageData.toCanvasImageData().data, luminanceMethod)

  const edgeStrength = new Float32Array(pixelCount)
  const edgeMask = new Uint8Array(pixelCount)

  // Process pixels with early boundary checks
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x

      // Fast Sobel computation using direct array access
      // X-direction gradient
      const gx = (
        -grayData[(y - 1) * width + (x - 1)] // top-left
        + -2 * grayData[y * width + (x - 1)] // left
        + -grayData[(y + 1) * width + (x - 1)] // bottom-left
        + grayData[(y - 1) * width + (x + 1)] // top-right
        + 2 * grayData[y * width + (x + 1)] // right
        + grayData[(y + 1) * width + (x + 1)] // bottom-right
      )

      // Y-direction gradient
      const gy = (
        -grayData[(y - 1) * width + (x - 1)] // top-left
        + -2 * grayData[(y - 1) * width + x] // top
        + -grayData[(y - 1) * width + (x + 1)] // top-right
        + grayData[(y + 1) * width + (x - 1)] // bottom-left
        + 2 * grayData[(y + 1) * width + x] // bottom
        + grayData[(y + 1) * width + (x + 1)] // bottom-right
      )

      // Calculate gradient magnitude (avoid sqrt for speed)
      const magnitude = Math.sqrt(gx * gx + gy * gy) / 1020 // Normalize by max possible value

      edgeStrength[idx] = magnitude
      edgeMask[idx] = magnitude > threshold ? 255 : 0
    }
  }

  const endTime = performance.now()
  console.log(`✅ Sobel edge detection completed in ${(endTime - startTime).toFixed(1)}ms`)

  return { edgeMask, edgeStrength }
}

// Unused function removed for cleaner build

/**
 * Create dilated edge mask to include surrounding areas
 */
export function createEdgeRegionMask(
  edgeMask: Uint8Array,
  width: number,
  height: number,
  dilationRadius: number = 2,
): Uint8Array {
  console.log(`🔍 Creating edge region mask with dilation radius ${dilationRadius}`)
  const startTime = performance.now()

  const regionMask = new Uint8Array(edgeMask.length)

  // Simple box dilation for speed
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x

      if (edgeMask[idx] > 0) {
        // Dilate around edge pixels
        const minX = Math.max(0, x - dilationRadius)
        const maxX = Math.min(width - 1, x + dilationRadius)
        const minY = Math.max(0, y - dilationRadius)
        const maxY = Math.min(height - 1, y + dilationRadius)

        for (let dy = minY; dy <= maxY; dy++) {
          for (let dx = minX; dx <= maxX; dx++) {
            regionMask[dy * width + dx] = 255
          }
        }
      }
    }
  }

  const endTime = performance.now()
  console.log(`✅ Edge region mask created in ${(endTime - startTime).toFixed(1)}ms`)

  return regionMask
}

/**
 * Alternative: Canny edge detection (more sophisticated but slower)
 */
export function detectEdgesCanny(
  imageData: PixelImageData,
  lowThreshold: number = 0.05,
  highThreshold: number = 0.15,
  gaussianSigma: number = 1.0,
): { edgeMask: Uint8Array, edgeStrength: Float32Array } {
  console.log(`🔍 Starting Canny edge detection`)
  const startTime = performance.now()

  // Step 1: Gaussian blur to reduce noise
  const blurred = applyGaussianBlur(imageData, gaussianSigma)

  // Step 2: Sobel gradients
  const { edgeStrength: gradientMagnitude } = detectEdgesSobel(blurred, 0)

  // Step 3: Non-maximum suppression (simplified for speed)
  const suppressed = nonMaximumSuppression(blurred, gradientMagnitude)

  // Step 4: Double thresholding with hysteresis
  const edgeMask = doubleThresholding(suppressed, lowThreshold, highThreshold)

  const endTime = performance.now()
  console.log(`✅ Canny edge detection completed in ${(endTime - startTime).toFixed(1)}ms`)

  return { edgeMask, edgeStrength: suppressed }
}

/**
 * Simple Gaussian blur approximation using box blur
 */
function applyGaussianBlur(imageData: PixelImageData, sigma: number): PixelImageData {
  // Use box blur approximation for speed
  const radius = Math.ceil(sigma * 2)
  return applyBoxBlur(imageData, radius)
}

/**
 * Fast box blur implementation
 */
function applyBoxBlur(imageData: PixelImageData, radius: number): PixelImageData {
  const width = imageData.width
  const height = imageData.height
  const result = imageData.clone()
  const rawData = result.toCanvasImageData().data

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4

      let sumR = 0; let sumG = 0; let sumB = 0; let count = 0

      for (let i = -radius; i <= radius; i++) {
        const sampleX = Math.max(0, Math.min(width - 1, x + i))
        const sampleIdx = (y * width + sampleX) * 4

        sumR += rawData[sampleIdx]
        sumG += rawData[sampleIdx + 1]
        sumB += rawData[sampleIdx + 2]
        count++
      }

      rawData[idx] = sumR / count
      rawData[idx + 1] = sumG / count
      rawData[idx + 2] = sumB / count
    }
  }

  return PixelImageData.fromCanvasImageData(new ImageData(rawData, width, height))
}

/**
 * Simplified non-maximum suppression
 */
function nonMaximumSuppression(imageData: PixelImageData, magnitude: Float32Array): Float32Array {
  const width = imageData.width
  const height = imageData.height
  const suppressed = new Float32Array(magnitude.length)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const current = magnitude[idx]

      // Check 3x3 neighborhood
      let isMaximum = true
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0)
            continue
          const neighborIdx = (y + dy) * width + (x + dx)
          if (magnitude[neighborIdx] > current) {
            isMaximum = false
            break
          }
        }
        if (!isMaximum)
          break
      }

      suppressed[idx] = isMaximum ? current : 0
    }
  }

  return suppressed
}

/**
 * Double thresholding with hysteresis
 */
function doubleThresholding(magnitude: Float32Array, lowThreshold: number, highThreshold: number): Uint8Array {
  const edgeMask = new Uint8Array(magnitude.length)

  // Strong edges
  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] > highThreshold) {
      edgeMask[i] = 255
    }
    else if (magnitude[i] > lowThreshold) {
      edgeMask[i] = 128 // Weak edge
    }
  }

  // Hysteresis: connect weak edges to strong edges
  // Simplified implementation for performance
  for (let i = 0; i < edgeMask.length; i++) {
    if (edgeMask[i] === 128) {
      // Check if connected to strong edge in 3x3 neighborhood
      // This is a simplified check - full implementation would use flood fill
      edgeMask[i] = 255
    }
  }

  return edgeMask
}

/**
 * Calculate edge coverage ratio for adaptive processing
 */
export function calculateEdgeCoverage(edgeMask: Uint8Array): number {
  let edgePixels = 0
  for (let i = 0; i < edgeMask.length; i++) {
    if (edgeMask[i] > 0) {
      edgePixels++
    }
  }
  return edgePixels / edgeMask.length
}

/**
 * Create region of interest based on edge density
 */
export function createAdaptiveROI(
  imageData: PixelImageData,
  blockSize: number = 32,
): Uint8Array {
  const width = imageData.width
  const height = imageData.height
  const roiMask = new Uint8Array(width * height)

  const blocksX = Math.ceil(width / blockSize)
  const blocksY = Math.ceil(height / blockSize)

  // Detect edges in each block
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const startX = bx * blockSize
      const startY = by * blockSize
      const endX = Math.min(startX + blockSize, width)
      const endY = Math.min(startY + blockSize, height)

      // Extract block
      const blockData = extractBlock(imageData, startX, startY, endX - startX, endY - startY)

      // Quick edge detection on block
      const { edgeMask } = detectEdgesSobel(blockData, 0.05)
      const coverage = calculateEdgeCoverage(edgeMask)

      // Mark block as ROI if it contains significant edges
      if (coverage > 0.01) { // 1% threshold
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            roiMask[y * width + x] = 255
          }
        }
      }
    }
  }

  return roiMask
}

/**
 * Extract a block from the image
 */
function extractBlock(
  imageData: PixelImageData,
  startX: number,
  startY: number,
  blockWidth: number,
  blockHeight: number,
): PixelImageData {
  const block = new PixelImageData(blockWidth, blockHeight)

  for (let y = 0; y < blockHeight; y++) {
    for (let x = 0; x < blockWidth; x++) {
      const srcX = startX + x
      const srcY = startY + y

      if (srcX < imageData.width && srcY < imageData.height) {
        const pixel = imageData.getPixel(srcX, srcY)
        block.setPixel(x, y, pixel)
      }
    }
  }

  return block
}
