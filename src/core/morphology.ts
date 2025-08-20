import { PixelImageData } from './imageData'
import { dilateWebGL, erodeWebGL } from './webglMorphology'

/**
 * Morphological operations for image processing
 */

/**
 * Generate circle kernel (matching Python implementation exactly)
 */
function generatePythonCircleKernel(r: number): number[][] {
  const intR = Math.floor(r)
  const size = 2 * intR + 1
  const kernel = new Array(size).fill(0).map(() => new Array(size).fill(0))

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const points = [
        [i - 0.5, j - 0.5],
        [i - 0.5, j + 0.5],
        [i + 0.5, j - 0.5],
        [i + 0.5, j + 0.5],
        [i, j + 0.5],
        [i, j - 0.5],
        [i + 0.5, j],
        [i - 0.5, j],
      ]

      const distances = points.map(p => Math.hypot((p[0] - intR), (p[1] - intR)))
      const maxDistance = Math.max(...distances)
      const minDistance = Math.min(...distances)

      if (maxDistance <= r) {
        kernel[i][j] = 1
      }
      else if (minDistance <= r) {
        const b = (r - minDistance) / (maxDistance - minDistance)
        kernel[i][j] = b
      }
    }
  }

  return kernel
}

/**
 * Predefined kernels matching Python KERNELS
 */
const PYTHON_KERNELS: { [key: number]: number[][] } = {
  1: generatePythonCircleKernel(1),
  2: generatePythonCircleKernel(1.5),
  3: generatePythonCircleKernel(2).slice(1, 4).map(row => row.slice(1, 4)),
  4: generatePythonCircleKernel(2.5),
  5: generatePythonCircleKernel(3).slice(1, 6).map(row => row.slice(1, 6)),
  6: generatePythonCircleKernel(3.5),
}

/**
 * Create expansion kernel (3x3 all ones - matching Python kernel_expansion)
 */
export function createExpansionKernel(): number[][] {
  return [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ]
}

/**
 * Create smoothing kernel (cross shape - matching Python kernel_smoothing)
 */
export function createSmoothingKernel(): number[][] {
  return [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ]
}

/**
 * Create a circular kernel for morphological operations (kept for backward compatibility)
 */
export function createCircularKernel(radius: number): number[][] {
  const size = Math.floor(radius) * 2 + 1
  const center = Math.floor(size / 2)
  const kernel: number[][] = []

  for (let y = 0; y < size; y++) {
    kernel[y] = []
    for (let x = 0; x < size; x++) {
      const dx = x - center
      const dy = y - center
      const distance = Math.hypot(dx, dy)

      // Create anti-aliased circular kernel
      if (distance <= radius - 0.5) {
        kernel[y][x] = 1
      }
      else if (distance <= radius + 0.5) {
        kernel[y][x] = radius + 0.5 - distance
      }
      else {
        kernel[y][x] = 0
      }
    }
  }

  return kernel
}

/**
 * Highly optimized morphological operation working directly with raw data
 */
function applyMorphologicalOperationFast(
  imageData: PixelImageData,
  kernel: number[][],
  operation: 'dilate' | 'erode',
  iterations: number = 1,
): PixelImageData {
  const width = imageData.width
  const height = imageData.height
  const kernelHalf = Math.floor(kernel.length / 2)

  // Convert to raw data once
  let srcData = new Uint8ClampedArray(imageData.toCanvasImageData().data)
  let dstData = new Uint8ClampedArray(srcData.length)

  for (let iter = 0; iter < iterations; iter++) {
    // Process each pixel
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const baseIndex = (y * width + x) * 4

        let extremeR = operation === 'dilate' ? 0 : 255
        let extremeG = operation === 'dilate' ? 0 : 255
        let extremeB = operation === 'dilate' ? 0 : 255
        let extremeA = operation === 'dilate' ? 0 : 255

        // Apply kernel - unrolled for common 3x3 case
        if (kernel.length === 3 && kernel[0].length === 3) {
          // Manually unroll 3x3 kernel for maximum speed
          for (let ky = 0; ky < 3; ky++) {
            for (let kx = 0; kx < 3; kx++) {
              if (kernel[ky][kx] <= 0) {
                continue
              }

              const px = Math.max(0, Math.min(width - 1, x + kx - 1))
              const py = Math.max(0, Math.min(height - 1, y + ky - 1))
              const srcIndex = (py * width + px) * 4

              const r = srcData[srcIndex]
              const g = srcData[srcIndex + 1]
              const b = srcData[srcIndex + 2]
              const a = srcData[srcIndex + 3]

              if (operation === 'dilate') {
                if (r > extremeR) {
                  extremeR = r
                }
                if (g > extremeG) {
                  extremeG = g
                }
                if (b > extremeB) {
                  extremeB = b
                }
                if (a > extremeA) {
                  extremeA = a
                }
              }
              else {
                if (r < extremeR) {
                  extremeR = r
                }
                if (g < extremeG) {
                  extremeG = g
                }
                if (b < extremeB) {
                  extremeB = b
                }
                if (a < extremeA) {
                  extremeA = a
                }
              }
            }
          }
        }
        else {
          // General case for other kernel sizes
          for (const [ky, element] of kernel.entries()) {
            for (const [kx, element_] of element.entries()) {
              if (element_ <= 0) {
                continue
              }

              const px = Math.max(0, Math.min(width - 1, x + kx - kernelHalf))
              const py = Math.max(0, Math.min(height - 1, y + ky - kernelHalf))
              const srcIndex = (py * width + px) * 4

              const r = srcData[srcIndex]
              const g = srcData[srcIndex + 1]
              const b = srcData[srcIndex + 2]
              const a = srcData[srcIndex + 3]

              if (operation === 'dilate') {
                if (r > extremeR) {
                  extremeR = r
                }
                if (g > extremeG) {
                  extremeG = g
                }
                if (b > extremeB) {
                  extremeB = b
                }
                if (a > extremeA) {
                  extremeA = a
                }
              }
              else {
                if (r < extremeR) {
                  extremeR = r
                }
                if (g < extremeG) {
                  extremeG = g
                }
                if (b < extremeB) {
                  extremeB = b
                }
                if (a < extremeA) {
                  extremeA = a
                }
              }
            }
          }
        }

        dstData[baseIndex] = extremeR
        dstData[baseIndex + 1] = extremeG
        dstData[baseIndex + 2] = extremeB
        dstData[baseIndex + 3] = extremeA
      }
    }

    // Swap buffers for next iteration
    [srcData, dstData] = [dstData, srcData]
  }

  return PixelImageData.fromCanvasImageData(new ImageData(srcData, width, height))
}

/**
 * Generic morphological operation with specified kernel (fallback to fast version)
 */
function applyMorphologicalOperation(
  imageData: PixelImageData,
  kernel: number[][],
  operation: 'dilate' | 'erode',
  iterations: number = 1,
): PixelImageData {
  return applyMorphologicalOperationFast(imageData, kernel, operation, iterations)
}

/**
 * Dilate operation with expansion kernel (GPU-accelerated when possible)
 */
export function dilate(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  // Try WebGL first for better performance
  console.log('🚀 Attempting WebGL dilation...')
  try {
    const result = dilateWebGL(imageData, iterations)
    console.log('✅ WebGL dilation successful!')
    return result
  }
  catch (error) {
    // Fallback to CPU implementation
    console.warn('❌ WebGL dilation failed, using CPU fallback:', error)
    const kernel = createExpansionKernel()
    return applyMorphologicalOperation(imageData, kernel, 'dilate', iterations)
  }
}

/**
 * Erode operation with expansion kernel (GPU-accelerated when possible)
 */
export function erode(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  // Try WebGL first for better performance
  console.log('🚀 Attempting WebGL erosion...')
  try {
    const result = erodeWebGL(imageData, iterations)
    console.log('✅ WebGL erosion successful!')
    return result
  }
  catch (error) {
    // Fallback to CPU implementation
    console.warn('❌ WebGL erosion failed, using CPU fallback:', error)
    const kernel = createExpansionKernel()
    return applyMorphologicalOperation(imageData, kernel, 'erode', iterations)
  }
}

/**
 * Dilate operation with smoothing kernel (GPU-accelerated when possible)
 */
export function dilateSmooth(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  console.log('🚀 Attempting WebGL smooth dilation...')
  try {
    // WebGL version works with 3x3 kernel, smoothing kernel is cross-shaped
    // For now, use regular WebGL dilation as approximation
    const result = dilateWebGL(imageData, iterations)
    console.log('✅ WebGL smooth dilation successful!')
    return result
  }
  catch (error) {
    console.warn('❌ WebGL smooth dilation failed, using CPU fallback:', error)
    const kernel = createSmoothingKernel()
    return applyMorphologicalOperation(imageData, kernel, 'dilate', iterations)
  }
}

/**
 * Erode operation with smoothing kernel (GPU-accelerated when possible)
 */
export function erodeSmooth(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  console.log('🚀 Attempting WebGL smooth erosion...')
  try {
    // WebGL version works with 3x3 kernel, smoothing kernel is cross-shaped
    // For now, use regular WebGL erosion as approximation
    const result = erodeWebGL(imageData, iterations)
    console.log('✅ WebGL smooth erosion successful!')
    return result
  }
  catch (error) {
    console.warn('❌ WebGL smooth erosion failed, using CPU fallback:', error)
    const kernel = createSmoothingKernel()
    return applyMorphologicalOperation(imageData, kernel, 'erode', iterations)
  }
}

/**
 * Morphological opening (erode then dilate)
 */
export function opening(imageData: PixelImageData, kernelSize: number = 3): PixelImageData {
  const eroded = erode(imageData, kernelSize)
  return dilate(eroded, kernelSize)
}

/**
 * Morphological closing (dilate then erode)
 */
export function closing(imageData: PixelImageData, kernelSize: number = 3): PixelImageData {
  const dilated = dilate(imageData, kernelSize)
  return erode(dilated, kernelSize)
}

/**
 * Dilate operation using specific kernel (matching PyTorch dilate_cont)
 */
export function dilateWithKernel(imageData: PixelImageData, kernelIndex: number, iterations: number = 1): PixelImageData {
  const kernel = PYTHON_KERNELS[kernelIndex]
  if (!kernel) {
    throw new Error(`Invalid kernel index: ${kernelIndex}`)
  }

  let result = imageData
  const kernelHalf = Math.floor(kernel.length / 2)

  // Perform iterations
  for (let iter = 0; iter < iterations; iter++) {
    const temp = new PixelImageData(result.width, result.height)

    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        let maxR = -Infinity; let maxG = -Infinity; let maxB = -Infinity; let maxA = -Infinity

        // Apply kernel
        for (const [ky, element] of kernel.entries()) {
          for (const [kx, weight] of element.entries()) {
            if (weight <= 0) {
              continue
            }

            const px = Math.min(Math.max(x + kx - kernelHalf, 0), result.width - 1)
            const py = Math.min(Math.max(y + ky - kernelHalf, 0), result.height - 1)

            const [r, g, b, a] = result.getPixel(px, py)

            // Matching PyTorch implementation: patches + kernel - 1 (working in [0,1] range)
            const normalizedR = r / 255
            const normalizedG = g / 255
            const normalizedB = b / 255
            const normalizedA = a / 255

            const weightedR = normalizedR + weight - 1
            const weightedG = normalizedG + weight - 1
            const weightedB = normalizedB + weight - 1
            const weightedA = normalizedA + weight - 1

            if (weightedR > maxR) {
              maxR = weightedR
            }
            if (weightedG > maxG) {
              maxG = weightedG
            }
            if (weightedB > maxB) {
              maxB = weightedB
            }
            if (weightedA > maxA) {
              maxA = weightedA
            }
          }
        }

        // Clamp to [0, 1] as per PyTorch implementation, then convert back to [0, 255]
        temp.setPixel(x, y, [
          Math.round(Math.max(0, Math.min(1, maxR)) * 255),
          Math.round(Math.max(0, Math.min(1, maxG)) * 255),
          Math.round(Math.max(0, Math.min(1, maxB)) * 255),
          Math.round(Math.max(0, Math.min(1, maxA)) * 255),
        ])
      }
    }

    result = temp
  }

  return result
}

/**
 * Erode operation using specific kernel (matching PyTorch erode_cont)
 */
export function erodeWithKernel(imageData: PixelImageData, kernelIndex: number, iterations: number = 1): PixelImageData {
  const kernel = PYTHON_KERNELS[kernelIndex]
  if (!kernel) {
    throw new Error(`Invalid kernel index: ${kernelIndex}`)
  }

  let result = imageData
  const kernelHalf = Math.floor(kernel.length / 2)

  // Perform iterations
  for (let iter = 0; iter < iterations; iter++) {
    const temp = new PixelImageData(result.width, result.height)

    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        let minR = Infinity; let minG = Infinity; let minB = Infinity; let minA = Infinity

        // Apply kernel
        for (const [ky, element] of kernel.entries()) {
          for (const [kx, weight] of element.entries()) {
            if (weight <= 0) {
              continue
            }

            const px = Math.min(Math.max(x + kx - kernelHalf, 0), result.width - 1)
            const py = Math.min(Math.max(y + ky - kernelHalf, 0), result.height - 1)

            const [r, g, b, a] = result.getPixel(px, py)

            // Matching PyTorch implementation: patches - kernel + 1 (working in [0,1] range)
            const normalizedR = r / 255
            const normalizedG = g / 255
            const normalizedB = b / 255
            const normalizedA = a / 255

            const weightedR = normalizedR - weight + 1
            const weightedG = normalizedG - weight + 1
            const weightedB = normalizedB - weight + 1
            const weightedA = normalizedA - weight + 1

            if (weightedR < minR) {
              minR = weightedR
            }
            if (weightedG < minG) {
              minG = weightedG
            }
            if (weightedB < minB) {
              minB = weightedB
            }
            if (weightedA < minA) {
              minA = weightedA
            }
          }
        }

        // Clamp to [0, 1] as per PyTorch implementation, then convert back to [0, 255]
        temp.setPixel(x, y, [
          Math.round(Math.max(0, Math.min(1, minR)) * 255),
          Math.round(Math.max(0, Math.min(1, minG)) * 255),
          Math.round(Math.max(0, Math.min(1, minB)) * 255),
          Math.round(Math.max(0, Math.min(1, minA)) * 255),
        ])
      }
    }

    result = temp
  }

  return result
}
