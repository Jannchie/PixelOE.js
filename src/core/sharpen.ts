import { clamp } from '../utils/math'
import { PixelImageData } from './imageData'

/**
 * Image sharpening algorithms
 */

export type SharpenMode = 'unsharp' | 'laplacian' | 'none'

/**
 * Apply convolution with a given kernel
 */
function applyConvolution(
  imageData: PixelImageData,
  kernel: number[][],
  normalize: boolean = true,
): PixelImageData {
  const result = new PixelImageData(imageData.width, imageData.height)
  const kernelSize = kernel.length
  const kernelRadius = Math.floor(kernelSize / 2)

  // Calculate kernel sum for normalization
  let kernelSum = 0
  if (normalize) {
    for (const row of kernel) {
      for (const val of row) {
        kernelSum += val
      }
    }
    // Avoid division by zero
    if (Math.abs(kernelSum) < 1e-6) {
      kernelSum = 1
    }
  }
  else {
    kernelSum = 1
  }

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      let r = 0; let g = 0; let b = 0
      let a = 0

      // Apply kernel
      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const kernelWeight = kernel[ky][kx]
          if (kernelWeight === 0) {
            continue
          }

          // Calculate sample position with boundary handling
          let sampleX = x + kx - kernelRadius
          let sampleY = y + ky - kernelRadius

          // Clamp to image boundaries (border extension)
          sampleX = clamp(sampleX, 0, imageData.width - 1)
          sampleY = clamp(sampleY, 0, imageData.height - 1)

          const [sr,sg,sb,sa] = imageData.getPixel(sampleX, sampleY)

          r += sr * kernelWeight
          g += sg * kernelWeight
          b += sb * kernelWeight

          // For alpha, just take the original pixel's alpha
          if (kx === kernelRadius && ky === kernelRadius) {
            a = sa
          }
        }
      }

      // Normalize and clamp
      result.setPixel(x, y, [
        clamp(Math.round(r / kernelSum), 0, 255),
        clamp(Math.round(g / kernelSum), 0, 255),
        clamp(Math.round(b / kernelSum), 0, 255),
        a,
      ])
    }
  }

  return result
}

/**
 * Create Gaussian blur kernel
 */
function createGaussianKernel(size: number, sigma: number): number[][] {
  const kernel: number[][] = []
  const center = Math.floor(size / 2)
  let sum = 0

  for (let y = 0; y < size; y++) {
    kernel[y] = []
    for (let x = 0; x < size; x++) {
      const dx = x - center
      const dy = y - center
      const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
      kernel[y][x] = value
      sum += value
    }
  }

  // Normalize kernel
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      kernel[y][x] /= sum
    }
  }

  return kernel
}

/**
 * Apply Gaussian blur to an image
 */
function gaussianBlur(
  imageData: PixelImageData,
  radius: number,
  sigma?: number,
): PixelImageData {
  if (sigma === undefined) {
    sigma = radius / 3 // Standard relationship
  }

  const kernelSize = radius * 2 + 1
  const kernel = createGaussianKernel(kernelSize, sigma)

  return applyConvolution(imageData, kernel, true)
}

/**
 * Unsharp mask sharpening
 * Based on the unsharp mask technique: original + amount * (original - blurred)
 */
export function unsharpMask(
  imageData: PixelImageData,
  amount: number = 1,
  radius: number = 1,
  threshold: number = 0,
): PixelImageData {
  // Create blurred version
  const blurred = gaussianBlur(imageData, radius)

  const result = new PixelImageData(imageData.width, imageData.height)

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [origR,origG,origB,origA] = imageData.getPixel(x, y)
      const [blurR,blurG,blurB] = blurred.getPixel(x, y)

      // Calculate difference
      const diffR = origR - blurR
      const diffG = origG - blurG
      const diffB = origB - blurB

      // Apply threshold - only sharpen if difference is above threshold
      let sharpR = origR
      let sharpG = origG
      let sharpB = origB

      if (Math.abs(diffR) > threshold) {
        sharpR = origR + amount * diffR
      }
      if (Math.abs(diffG) > threshold) {
        sharpG = origG + amount * diffG
      }
      if (Math.abs(diffB) > threshold) {
        sharpB = origB + amount * diffB
      }

      result.setPixel(x, y, [
        clamp(Math.round(sharpR), 0, 255),
        clamp(Math.round(sharpG), 0, 255),
        clamp(Math.round(sharpB), 0, 255),
        origA,
      ])
    }
  }

  return result
}

/**
 * Laplacian sharpening
 * Uses Laplacian edge detection kernel to enhance edges
 */
export function laplacianSharpen(
  imageData: PixelImageData,
  strength: number = 0.5,
): PixelImageData {
  // Standard Laplacian kernel for edge detection
  const laplacianKernel = [
    [0, -1, 0],
    [-1, 4, -1],
    [0, -1, 0],
  ]

  // Alternative 8-connected Laplacian kernel (more aggressive)
  // const laplacianKernel8 = [
  //   [-1, -1, -1],
  //   [-1, 8, -1],
  //   [-1, -1, -1]
  // ];

  // Use standard 4-connected kernel by default
  const kernel = laplacianKernel

  // Apply Laplacian filter (don't normalize since we want edge response)
  const edges = applyConvolution(imageData, kernel, false)

  const result = new PixelImageData(imageData.width, imageData.height)

  // Add edge information back to original image
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [origR,origG,origB,origA] = imageData.getPixel(x, y)
      const [edgeR,edgeG,edgeB] = edges.getPixel(x, y)

      // Add edges with specified strength
      const sharpR = origR + strength * edgeR
      const sharpG = origG + strength * edgeG
      const sharpB = origB + strength * edgeB

      result.setPixel(x, y, [
        clamp(Math.round(sharpR), 0, 255),
        clamp(Math.round(sharpG), 0, 255),
        clamp(Math.round(sharpB), 0, 255),
        origA,
      ])
    }
  }

  return result
}

/**
 * Alternative Laplacian sharpening with different kernel
 */
export function laplacianSharpenEnhanced(
  imageData: PixelImageData,
  strength: number = 0.3,
): PixelImageData {
  // Enhanced Laplacian kernel (8-connected)
  const kernel = [
    [-1, -1, -1],
    [-1, 8, -1],
    [-1, -1, -1],
  ]

  const edges = applyConvolution(imageData, kernel, false)
  const result = new PixelImageData(imageData.width, imageData.height)

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [origR,origG,origB,origA] = imageData.getPixel(x, y)
      const [edgeR,edgeG,edgeB] = edges.getPixel(x, y)

      const sharpR = origR + strength * edgeR
      const sharpG = origG + strength * edgeG
      const sharpB = origB + strength * edgeB

      result.setPixel(x, y, [
        clamp(Math.round(sharpR), 0, 255),
        clamp(Math.round(sharpG), 0, 255),
        clamp(Math.round(sharpB), 0, 255),
        origA,
      ])
    }
  }

  return result
}

/**
 * Apply sharpening with the specified method
 */
export function applySharpen(
  imageData: PixelImageData,
  mode: SharpenMode,
  strength: number = 1,
): PixelImageData {
  switch (mode) {
    case 'unsharp': {
      return unsharpMask(imageData, strength, Math.ceil(strength), 0)
    }

    case 'laplacian': {
      return laplacianSharpen(imageData, strength * 0.5)
    }

    case 'none':
    default: {
      return imageData.clone()
    }
  }
}

/**
 * High-pass filter for sharpening (used in unsharp mask)
 */
export function highPassFilter(
  imageData: PixelImageData,
  radius: number = 1,
): PixelImageData {
  const blurred = gaussianBlur(imageData, radius)
  const result = new PixelImageData(imageData.width, imageData.height)

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [origR,origG,origB,origA] = imageData.getPixel(x, y)
      const [blurR,blurG,blurB] = blurred.getPixel(x, y)

      // High-pass = original - low-pass (blurred)
      result.setPixel(x, y, [
        clamp(origR - blurR + 128, 0, 255), // Add 128 to center the values
        clamp(origG - blurG + 128, 0, 255),
        clamp(origB - blurB + 128, 0, 255),
        origA,
      ])
    }
  }

  return result
}
