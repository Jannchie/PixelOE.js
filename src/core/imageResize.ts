/**
 * Professional image resizing using Pica library
 * Replaces all manual resize implementations with high-quality library functions
 */
import Pica from 'pica'
import { PixelImageData } from './imageData'

// Initialize Pica instance with optimized settings
const pica = new Pica({
  features: ['js', 'wasm', 'ww'], // Use all available optimization features
  idle: 2000  // Keep workers alive for 2 seconds for better performance
})

/**
 * High-quality bilinear resize using Pica library
 * This replaces canvasBilinearResize and other manual implementations
 */
export async function resizeImageBilinear(
  imageData: PixelImageData, 
  newWidth: number, 
  newHeight: number
): Promise<PixelImageData> {
  // Create source canvas
  const srcCanvas = document.createElement('canvas')
  const srcCtx = srcCanvas.getContext('2d')!
  srcCanvas.width = imageData.width
  srcCanvas.height = imageData.height
  
  // Put source data into canvas
  const srcImageData = srcCtx.createImageData(imageData.width, imageData.height)
  srcImageData.data.set(imageData.data)
  srcCtx.putImageData(srcImageData, 0, 0)
  
  // Create destination canvas
  const dstCanvas = document.createElement('canvas')
  dstCanvas.width = newWidth
  dstCanvas.height = newHeight
  
  // Use Pica for high-quality resize
  await pica.resize(srcCanvas, dstCanvas, {
    quality: 3,                // High-quality (0-3)
    unsharpAmount: 0,          // No sharpening for consistent results
    unsharpRadius: 0,
    unsharpThreshold: 0
  })
  
  // Extract result
  const dstCtx = dstCanvas.getContext('2d')!
  const resultImageData = dstCtx.getImageData(0, 0, newWidth, newHeight)
  return PixelImageData.fromCanvasImageData(resultImageData)
}

/**
 * Nearest neighbor resize using Pica library
 * This replaces canvasNearestResize
 */
export async function resizeImageNearest(
  imageData: PixelImageData, 
  newWidth: number, 
  newHeight: number
): Promise<PixelImageData> {
  // Create source canvas
  const srcCanvas = document.createElement('canvas')
  const srcCtx = srcCanvas.getContext('2d')!
  srcCanvas.width = imageData.width
  srcCanvas.height = imageData.height
  
  // Put source data into canvas
  const srcImageData = srcCtx.createImageData(imageData.width, imageData.height)
  srcImageData.data.set(imageData.data)
  srcCtx.putImageData(srcImageData, 0, 0)
  
  // Create destination canvas
  const dstCanvas = document.createElement('canvas')
  dstCanvas.width = newWidth
  dstCanvas.height = newHeight
  
  // Use Pica with low quality for nearest neighbor approximation
  await pica.resize(srcCanvas, dstCanvas, {
    quality: 0,                // Low quality approximates nearest neighbor
    unsharpAmount: 0,
    unsharpRadius: 0,
    unsharpThreshold: 0
  })
  
  // Extract result
  const dstCtx = dstCanvas.getContext('2d')!
  const resultImageData = dstCtx.getImageData(0, 0, newWidth, newHeight)
  return PixelImageData.fromCanvasImageData(resultImageData)
}

/**
 * High-quality Lanczos resize using Pica library
 * This replaces manual highQualityResize implementations
 */
export async function resizeImageLanczos(
  imageData: PixelImageData, 
  newWidth: number, 
  newHeight: number
): Promise<PixelImageData> {
  // Create source canvas
  const srcCanvas = document.createElement('canvas')
  const srcCtx = srcCanvas.getContext('2d')!
  srcCanvas.width = imageData.width
  srcCanvas.height = imageData.height
  
  // Put source data into canvas
  const srcImageData = srcCtx.createImageData(imageData.width, imageData.height)
  srcImageData.data.set(imageData.data)
  srcCtx.putImageData(srcImageData, 0, 0)
  
  // Create destination canvas
  const dstCanvas = document.createElement('canvas')
  dstCanvas.width = newWidth
  dstCanvas.height = newHeight
  
  // Use Pica with highest quality
  await pica.resize(srcCanvas, dstCanvas, {
    quality: 3,                // Highest quality
    unsharpAmount: 0,          // No post-processing for consistency
    unsharpRadius: 0,
    unsharpThreshold: 0
  })
  
  // Extract result
  const dstCtx = dstCanvas.getContext('2d')!
  const resultImageData = dstCtx.getImageData(0, 0, newWidth, newHeight)
  return PixelImageData.fromCanvasImageData(resultImageData)
}

/**
 * Synchronous fallback for compatibility
 * Uses the original Canvas API when async is not suitable
 */
export function resizeImageSync(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number,
  algorithm: 'bilinear' | 'nearest' = 'bilinear'
): PixelImageData {
  // Create source canvas
  const srcCanvas = document.createElement('canvas')
  const srcCtx = srcCanvas.getContext('2d')!
  srcCanvas.width = imageData.width
  srcCanvas.height = imageData.height
  
  // Put source data into canvas
  const srcImageData = srcCtx.createImageData(imageData.width, imageData.height)
  srcImageData.data.set(imageData.data)
  srcCtx.putImageData(srcImageData, 0, 0)
  
  // Create destination canvas
  const dstCanvas = document.createElement('canvas')
  const dstCtx = dstCanvas.getContext('2d')!
  dstCanvas.width = newWidth
  dstCanvas.height = newHeight
  
  // Configure smoothing based on algorithm
  dstCtx.imageSmoothingEnabled = algorithm === 'bilinear'
  if (algorithm === 'bilinear') {
    dstCtx.imageSmoothingQuality = 'high'
  }
  
  // Use native Canvas drawImage
  dstCtx.drawImage(srcCanvas, 0, 0, newWidth, newHeight)
  
  // Extract result
  const resultImageData = dstCtx.getImageData(0, 0, newWidth, newHeight)
  return PixelImageData.fromCanvasImageData(resultImageData)
}

/**
 * Smart resize function that chooses the best algorithm based on context
 */
export async function resizeImageSmart(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number,
  options: {
    quality?: 'low' | 'medium' | 'high'
    async?: boolean
  } = {}
): Promise<PixelImageData> {
  const { quality = 'high', async = true } = options
  
  // For small images or when sync is required, use fallback
  if (!async || (imageData.width * imageData.height < 10000)) {
    return resizeImageSync(imageData, newWidth, newHeight, 
      quality === 'low' ? 'nearest' : 'bilinear')
  }
  
  // Choose algorithm based on quality setting
  switch (quality) {
    case 'low':
      return resizeImageNearest(imageData, newWidth, newHeight)
    case 'medium':
      return resizeImageBilinear(imageData, newWidth, newHeight)
    case 'high':
    default:
      return resizeImageLanczos(imageData, newWidth, newHeight)
  }
}