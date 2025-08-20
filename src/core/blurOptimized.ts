/**
 * Optimized blur implementations
 */
import { clamp } from '../utils/math'

/**
 * Optimized simple Gaussian blur (box blur approximation)
 * Uses same algorithm as original but with performance optimizations
 */
export function simpleGaussianBlurOptimized(
  channel: Float32Array, 
  width: number, 
  height: number, 
  radius: number
): Float32Array {
  if (radius <= 0) return new Float32Array(channel)
  
  const result = new Float32Array(channel.length)
  
  // Use same algorithm as original but with optimized memory access
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      
      // Apply blur kernel - same logic as original
      for (let ky = -radius; ky <= radius; ky++) {
        const ny = clamp(y + ky, 0, height - 1)
        const nyOffset = ny * width
        
        for (let kx = -radius; kx <= radius; kx++) {
          const nx = clamp(x + kx, 0, width - 1)
          sum += channel[nyOffset + nx]
          count++
        }
      }
      
      result[rowOffset + x] = sum / count
    }
  }
  
  return result
}

/**
 * Separable blur for maximum performance (different results but much faster)
 */
export function separableGaussianBlur(
  channel: Float32Array, 
  width: number, 
  height: number, 
  radius: number
): Float32Array {
  if (radius <= 0) return new Float32Array(channel)
  
  const kernelSize = 2 * radius + 1
  const temp = new Float32Array(channel.length)
  const result = new Float32Array(channel.length)
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      
      // Optimized kernel bounds calculation
      const xStart = Math.max(0, x - radius)
      const xEnd = Math.min(width - 1, x + radius)
      
      for (let kx = xStart; kx <= xEnd; kx++) {
        sum += channel[rowOffset + kx]
        count++
      }
      
      temp[rowOffset + x] = sum / count
    }
  }
  
  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0
      let count = 0
      
      // Optimized kernel bounds calculation
      const yStart = Math.max(0, y - radius)
      const yEnd = Math.min(height - 1, y + radius)
      
      for (let ky = yStart; ky <= yEnd; ky++) {
        sum += temp[ky * width + x]
        count++
      }
      
      result[y * width + x] = sum / count
    }
  }
  
  return result
}

/**
 * Ultra-fast box blur using running sum
 * Even faster but slightly different results from simple blur
 */
export function fastBoxBlur(
  channel: Float32Array,
  width: number,
  height: number, 
  radius: number
): Float32Array {
  if (radius <= 0) return new Float32Array(channel)
  
  const temp = new Float32Array(channel.length)
  const result = new Float32Array(channel.length)
  const kernelSize = 2 * radius + 1
  
  // Horizontal pass with running sum
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    let sum = 0
    
    // Initialize running sum for first pixel
    for (let i = 0; i <= radius && i < width; i++) {
      sum += channel[rowOffset + i]
    }
    
    temp[rowOffset] = sum / Math.min(kernelSize, width)
    
    // Slide the window
    for (let x = 1; x < width; x++) {
      // Remove leftmost pixel if it exists
      if (x - radius - 1 >= 0) {
        sum -= channel[rowOffset + x - radius - 1]
      }
      
      // Add rightmost pixel if it exists
      if (x + radius < width) {
        sum += channel[rowOffset + x + radius]
      }
      
      const actualKernelSize = Math.min(x + radius + 1, width) - Math.max(x - radius, 0)
      temp[rowOffset + x] = sum / actualKernelSize
    }
  }
  
  // Vertical pass with running sum
  for (let x = 0; x < width; x++) {
    let sum = 0
    
    // Initialize running sum for first pixel
    for (let i = 0; i <= radius && i < height; i++) {
      sum += temp[i * width + x]
    }
    
    result[x] = sum / Math.min(kernelSize, height)
    
    // Slide the window
    for (let y = 1; y < height; y++) {
      // Remove topmost pixel if it exists
      if (y - radius - 1 >= 0) {
        sum -= temp[(y - radius - 1) * width + x]
      }
      
      // Add bottommost pixel if it exists  
      if (y + radius < height) {
        sum += temp[(y + radius) * width + x]
      }
      
      const actualKernelSize = Math.min(y + radius + 1, height) - Math.max(y - radius, 0)
      result[y * width + x] = sum / actualKernelSize
    }
  }
  
  return result
}

/**
 * Optimized Gaussian blur with pre-computed weights
 * More accurate than box blur but still fast
 */
export function optimizedGaussianBlur(
  channel: Float32Array,
  width: number,
  height: number,
  radius: number
): Float32Array {
  if (radius <= 0) return new Float32Array(channel)
  
  const kernelSize = Math.ceil(radius * 2) * 2 + 1
  const halfKernel = Math.floor(kernelSize / 2)
  
  // Pre-compute Gaussian weights
  const weights = new Float32Array(kernelSize)
  let weightSum = 0
  
  for (let i = 0; i < kernelSize; i++) {
    const x = i - halfKernel
    const weight = Math.exp(-(x * x) / (2 * radius * radius))
    weights[i] = weight
    weightSum += weight
  }
  
  // Normalize weights
  for (let i = 0; i < kernelSize; i++) {
    weights[i] /= weightSum
  }
  
  const temp = new Float32Array(channel.length)
  const result = new Float32Array(channel.length)
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    
    for (let x = 0; x < width; x++) {
      let sum = 0
      
      for (let i = 0; i < kernelSize; i++) {
        const px = clamp(x + i - halfKernel, 0, width - 1)
        sum += channel[rowOffset + px] * weights[i]
      }
      
      temp[rowOffset + x] = sum
    }
  }
  
  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0
      
      for (let i = 0; i < kernelSize; i++) {
        const py = clamp(y + i - halfKernel, 0, height - 1)
        sum += temp[py * width + x] * weights[i]
      }
      
      result[y * width + x] = sum
    }
  }
  
  return result
}

/**
 * Multi-threaded blur simulation using batch processing
 * Processes image in chunks for better cache locality
 */
export function batchGaussianBlur(
  channel: Float32Array,
  width: number,
  height: number,
  radius: number,
  chunkSize: number = 64
): Float32Array {
  if (radius <= 0) return new Float32Array(channel)
  
  const result = new Float32Array(channel.length)
  
  // Process image in chunks
  for (let chunkY = 0; chunkY < height; chunkY += chunkSize) {
    const endY = Math.min(chunkY + chunkSize, height)
    
    for (let chunkX = 0; chunkX < width; chunkX += chunkSize) {
      const endX = Math.min(chunkX + chunkSize, width)
      
      // Extract chunk with padding
      const paddedWidth = endX - chunkX + 2 * radius
      const paddedHeight = endY - chunkY + 2 * radius
      const paddedChunk = new Float32Array(paddedWidth * paddedHeight)
      
      // Copy chunk with boundary handling
      for (let y = 0; y < paddedHeight; y++) {
        for (let x = 0; x < paddedWidth; x++) {
          const srcX = clamp(chunkX + x - radius, 0, width - 1)
          const srcY = clamp(chunkY + y - radius, 0, height - 1)
          paddedChunk[y * paddedWidth + x] = channel[srcY * width + srcX]
        }
      }
      
      // Apply blur to padded chunk
      const blurredChunk = simpleGaussianBlurOptimized(paddedChunk, paddedWidth, paddedHeight, radius)
      
      // Copy results back (without padding)
      for (let y = chunkY; y < endY; y++) {
        for (let x = chunkX; x < endX; x++) {
          const chunkLocalX = x - chunkX + radius
          const chunkLocalY = y - chunkY + radius
          result[y * width + x] = blurredChunk[chunkLocalY * paddedWidth + chunkLocalX]
        }
      }
    }
  }
  
  return result
}