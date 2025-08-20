/**
 * Optimized color space conversion utilities
 */
import { PixelImageData } from './imageData'

// Lookup tables for expensive operations
const GAMMA_CORRECTION_TABLE = new Float32Array(256)
const INVERSE_GAMMA_CORRECTION_TABLE = new Float32Array(256)
const XYZ_TO_LAB_TABLE = new Float32Array(10000) // For values 0-1 mapped to 0-9999

// Initialize lookup tables
function initializeTables() {
  // Gamma correction table
  for (let i = 0; i < 256; i++) {
    const normalized = i / 255.0
    GAMMA_CORRECTION_TABLE[i] = normalized > 0.04045 
      ? Math.pow((normalized + 0.055) / 1.055, 2.4) 
      : normalized / 12.92
  }
  
  // Inverse gamma correction table
  for (let i = 0; i < 256; i++) {
    const linear = i / 255.0
    INVERSE_GAMMA_CORRECTION_TABLE[i] = linear > 0.0031308 
      ? 1.055 * Math.pow(linear, 1/2.4) - 0.055 
      : 12.92 * linear
  }
  
  // XYZ to LAB conversion table
  for (let i = 0; i < 10000; i++) {
    const value = i / 9999.0
    XYZ_TO_LAB_TABLE[i] = value > 0.008856 
      ? Math.pow(value, 1/3) 
      : (7.787 * value + 16/116)
  }
}

// Initialize tables once
initializeTables()

/**
 * Fast table lookup for XYZ to LAB conversion
 */
function xyzToLabLookup(value: number): number {
  const index = Math.max(0, Math.min(9999, Math.floor(value * 9999)))
  return XYZ_TO_LAB_TABLE[index]
}

/**
 * Optimized RGB to LAB conversion
 */
export function rgbToLabOptimized(r: number, g: number, b: number): [number, number, number] {
  // Use lookup table for gamma correction
  const rLinear = GAMMA_CORRECTION_TABLE[r]
  const gLinear = GAMMA_CORRECTION_TABLE[g]
  const bLinear = GAMMA_CORRECTION_TABLE[b]

  // Convert to XYZ color space (D65 illuminant) - use constants for better performance
  let x = rLinear * 0.4124564 + gLinear * 0.3575761 + bLinear * 0.1804375
  let y = rLinear * 0.2126729 + gLinear * 0.7151522 + bLinear * 0.0721750
  let z = rLinear * 0.0193339 + gLinear * 0.1191920 + bLinear * 0.9503041

  // Normalize by D65 white point
  x *= 1.0521110684307801  // 1 / 0.95047
  y *= 1.0                 // 1 / 1.00000  
  z *= 0.9184170299743318  // 1 / 1.08883

  // Convert XYZ to LAB using lookup table
  const fx = xyzToLabLookup(x)
  const fy = xyzToLabLookup(y)
  const fz = xyzToLabLookup(z)

  const l = 116 * fy - 16
  const a = 500 * (fx - fy)
  const bLab = 200 * (fy - fz)

  return [l, a, bLab]
}

/**
 * Optimized LAB to RGB conversion
 */
export function labToRgbOptimized(l: number, a: number, b: number): [number, number, number] {
  let y = (l + 16) / 116
  let x = a / 500 + y
  let z = y - b / 200

  // Fast conversion back to XYZ with optimized threshold
  const threshold = 0.206893
  x = x > threshold ? x * x * x : (x - 16/116) / 7.787
  y = y > threshold ? y * y * y : (y - 16/116) / 7.787  
  z = z > threshold ? z * z * z : (z - 16/116) / 7.787

  // Apply D65 white point
  x *= 0.95047
  y *= 1.00000
  z *= 1.08883

  // Convert XYZ to RGB using optimized matrix multiplication
  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314
  let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560
  let bRgb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252

  // Apply inverse gamma correction with clamping
  r = Math.max(0, Math.min(1, r > 0.0031308 ? 1.055 * Math.pow(r, 1/2.4) - 0.055 : 12.92 * r))
  g = Math.max(0, Math.min(1, g > 0.0031308 ? 1.055 * Math.pow(g, 1/2.4) - 0.055 : 12.92 * g))
  bRgb = Math.max(0, Math.min(1, bRgb > 0.0031308 ? 1.055 * Math.pow(bRgb, 1/2.4) - 0.055 : 12.92 * bRgb))

  // Convert to [0, 255] range - use bitwise OR for fast floor
  return [
    (r * 255) | 0,
    (g * 255) | 0, 
    (bRgb * 255) | 0
  ]
}

/**
 * Batch conversion of RGB to LAB for better performance
 */
export function batchRgbToLabOptimized(pixels: number[][]): number[][] {
  const result: number[][] = new Array(pixels.length)
  
  for (let i = 0; i < pixels.length; i++) {
    result[i] = rgbToLabOptimized(pixels[i][0], pixels[i][1], pixels[i][2])
  }
  
  return result
}

/**
 * Batch conversion of LAB to RGB for better performance  
 */
export function batchLabToRgbOptimized(pixels: number[][]): number[][] {
  const result: number[][] = new Array(pixels.length)
  
  for (let i = 0; i < pixels.length; i++) {
    result[i] = labToRgbOptimized(pixels[i][0], pixels[i][1], pixels[i][2])
  }
  
  return result
}

/**
 * Convert entire PixelImageData from RGB to LAB space (in-place processing)
 */
export function convertImageToLab(imageData: PixelImageData): Float32Array[] {
  const width = imageData.width
  const height = imageData.height
  const pixelCount = width * height
  
  const lChannel = new Float32Array(pixelCount)
  const aChannel = new Float32Array(pixelCount) 
  const bChannel = new Float32Array(pixelCount)
  
  let index = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = imageData.getPixel(x, y)
      const [l, a, bLab] = rgbToLabOptimized(r, g, b)
      
      lChannel[index] = l
      aChannel[index] = a
      bChannel[index] = bLab
      index++
    }
  }
  
  return [lChannel, aChannel, bChannel]
}

/**
 * Convert LAB channels back to PixelImageData
 */
export function convertLabToImage(
  lChannel: Float32Array, 
  aChannel: Float32Array, 
  bChannel: Float32Array,
  width: number,
  height: number
): PixelImageData {
  const result = new PixelImageData(width, height)
  
  let index = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = labToRgbOptimized(lChannel[index], aChannel[index], bChannel[index])
      result.setPixel(x, y, [r, g, b, 255])
      index++
    }
  }
  
  return result
}