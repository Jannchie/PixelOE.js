/**
 * Canvas-based resize implementation - much faster than manual pixel manipulation
 */
import { PixelImageData } from './imageData'

/**
 * Fast bilinear resize using Canvas API
 * Canvas internally uses optimized native code for resizing
 */
export function canvasBilinearResize(imageData: PixelImageData, newWidth: number, newHeight: number): PixelImageData {
  // Create temporary canvas for source image
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
  
  // Use Canvas's native resize (high quality bilinear by default)
  dstCtx.imageSmoothingEnabled = true
  dstCtx.imageSmoothingQuality = 'high'
  dstCtx.drawImage(srcCanvas, 0, 0, newWidth, newHeight)
  
  // Extract result
  const resultImageData = dstCtx.getImageData(0, 0, newWidth, newHeight)
  return PixelImageData.fromCanvasImageData(resultImageData)
}

/**
 * Fast nearest neighbor resize using Canvas API
 */
export function canvasNearestResize(imageData: PixelImageData, newWidth: number, newHeight: number): PixelImageData {
  // Create temporary canvas for source image
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
  
  // Disable smoothing for nearest neighbor
  dstCtx.imageSmoothingEnabled = false
  dstCtx.drawImage(srcCanvas, 0, 0, newWidth, newHeight)
  
  // Extract result
  const resultImageData = dstCtx.getImageData(0, 0, newWidth, newHeight)
  return PixelImageData.fromCanvasImageData(resultImageData)
}