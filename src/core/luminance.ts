/**
 * Advanced luminance calculation methods for better edge detection and image processing
 */

/**
 * Current method: ITU-R BT.601 (legacy)
 * Issues: Based on old CRT displays, not perceptually uniform
 */
export function luminanceRec601(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * ITU-R BT.709 (HD standard) - more modern
 * Better for modern displays, slightly different weights
 */
export function luminanceRec709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * ITU-R BT.2020 (4K/HDR standard) - most modern
 * Optimized for wide color gamut displays
 */
export function luminanceRec2020(r: number, g: number, b: number): number {
  return 0.2627 * r + 0.678 * g + 0.0593 * b
}

/**
 * sRGB to Linear RGB conversion
 * Essential for accurate luminance calculation
 */
function sRGBToLinear(value: number): number {
  const normalized = value / 255
  if (normalized <= 0.040_45) {
    return normalized / 12.92
  }
  return ((normalized + 0.055) / 1.055) ** 2.4
}

// Unused function removed for cleaner build

/**
 * Linear luminance calculation (most accurate for perceptual uniformity)
 * Converts to linear RGB first, then calculates luminance
 */
export function luminanceLinear(r: number, g: number, b: number): number {
  const rLinear = sRGBToLinear(r)
  const gLinear = sRGBToLinear(g)
  const bLinear = sRGBToLinear(b)

  // Use Rec.709 weights for linear RGB
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear
}

/**
 * CIE L*a*b* color space conversion
 * Lab L* component provides perceptually uniform lightness
 */
export function rgbToLab(r: number, g: number, b: number): { L: number, a: number, b_channel: number } {
  // Convert sRGB to linear RGB
  const rLinear = sRGBToLinear(r)
  const gLinear = sRGBToLinear(g)
  const bLinear = sRGBToLinear(b)

  // Convert to XYZ (D65 illuminant)
  let x = rLinear * 0.412_456_4 + gLinear * 0.357_576_1 + bLinear * 0.180_437_5
  let y = rLinear * 0.212_672_9 + gLinear * 0.715_152_2 + bLinear * 0.072_175
  let z = rLinear * 0.019_333_9 + gLinear * 0.119_192 + bLinear * 0.950_304_1

  // Normalize to D65 white point
  x = x / 0.950_47
  y = y / 1
  z = z / 1.088_83

  // Apply Lab transformation
  const fx = x > 0.008_856 ? Math.cbrt(x) : (7.787_037 * x + 16 / 116)
  const fy = y > 0.008_856 ? Math.cbrt(y) : (7.787_037 * y + 16 / 116)
  const fz = z > 0.008_856 ? Math.cbrt(z) : (7.787_037 * z + 16 / 116)

  const L = 116 * fy - 16 // Lightness (0-100)
  const a = 500 * (fx - fy) // Green-Red axis
  const b_channel = 200 * (fy - fz) // Blue-Yellow axis

  return { L, a, b_channel }
}

/**
 * Lab L* component as luminance (most perceptually accurate)
 */
export function luminanceLab(r: number, g: number, b: number): number {
  const { L } = rgbToLab(r, g, b)
  return L / 100 // Normalize to 0-1 range
}

/**
 * Oklab color space conversion (newer, more accurate than Lab)
 * Better perceptual uniformity, especially in blue regions
 */
export function rgbToOklab(r: number, g: number, b: number): { L: number, a: number, b_channel: number } {
  // Convert sRGB to linear RGB
  const rLinear = sRGBToLinear(r)
  const gLinear = sRGBToLinear(g)
  const bLinear = sRGBToLinear(b)

  // Convert to LMS cone space
  const l = 0.412_221_470_8 * rLinear + 0.536_332_536_3 * gLinear + 0.051_445_992_9 * bLinear
  const m = 0.211_903_498_2 * rLinear + 0.680_699_545_1 * gLinear + 0.107_396_956_6 * bLinear
  const s = 0.088_302_461_9 * rLinear + 0.281_718_837_6 * gLinear + 0.629_978_700_5 * bLinear

  // Apply cube root
  const lCbrt = Math.cbrt(l)
  const mCbrt = Math.cbrt(m)
  const sCbrt = Math.cbrt(s)

  // Convert to Oklab
  const L = 0.210_454_255_3 * lCbrt + 0.793_617_785 * mCbrt - 0.004_072_046_8 * sCbrt
  const a = 1.977_998_495_1 * lCbrt - 2.428_592_205 * mCbrt + 0.450_593_709_9 * sCbrt
  const b_channel = 0.025_904_037_1 * lCbrt + 0.782_771_766_2 * mCbrt - 0.808_675_766 * sCbrt

  return { L, a, b_channel }
}

/**
 * Oklab L component as luminance (most modern and accurate)
 */
export function luminanceOklab(r: number, g: number, b: number): number {
  const { L } = rgbToOklab(r, g, b)
  return L // Already in 0-1 range
}

/**
 * Relative luminance for accessibility (WCAG standard)
 * Used for contrast ratio calculations
 */
export function luminanceWCAG(r: number, g: number, b: number): number {
  const rLinear = sRGBToLinear(r)
  const gLinear = sRGBToLinear(g)
  const bLinear = sRGBToLinear(b)

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear
}

/**
 * Perceived lightness using different methods
 */
export type LuminanceMethod
  = | 'rec601' // Legacy ITU-R BT.601
    | 'rec709' // Modern ITU-R BT.709 (recommended for most cases)
    | 'rec2020' // HDR ITU-R BT.2020
    | 'linear' // Linear luminance (gamma corrected)
    | 'lab' // CIE Lab L* (perceptually uniform)
    | 'oklab' // Oklab L (most modern, best uniformity)
    | 'wcag' // WCAG accessibility standard

/**
 * Calculate luminance using specified method
 */
export function calculateLuminance(
  r: number,
  g: number,
  b: number,
  method: LuminanceMethod = 'rec709',
): number {
  switch (method) {
    case 'rec601': { return luminanceRec601(r, g, b) / 255
    }
    case 'rec709': { return luminanceRec709(r, g, b) / 255
    }
    case 'rec2020': { return luminanceRec2020(r, g, b) / 255
    }
    case 'linear': { return luminanceLinear(r, g, b)
    }
    case 'lab': { return luminanceLab(r, g, b)
    }
    case 'oklab': { return luminanceOklab(r, g, b)
    }
    case 'wcag': { return luminanceWCAG(r, g, b)
    }
    default: { return luminanceRec709(r, g, b) / 255
    }
  }
}

/**
 * Fast batch luminance conversion for image processing
 */
export function convertToLuminance(
  imageData: Uint8ClampedArray,
  method: LuminanceMethod = 'rec709',
): Float32Array {
  const pixelCount = imageData.length / 4
  const luminanceData = new Float32Array(pixelCount)

  // Pre-calculate method function for performance
  let luminanceFunc: (r: number, g: number, b: number) => number

  switch (method) {
    case 'rec601': {
      luminanceFunc = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255
      break
    }
    case 'rec709': {
      luminanceFunc = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      break
    }
    case 'rec2020': {
      luminanceFunc = (r, g, b) => (0.2627 * r + 0.678 * g + 0.0593 * b) / 255
      break
    }
    case 'linear': {
      luminanceFunc = luminanceLinear
      break
    }
    case 'lab': {
      luminanceFunc = luminanceLab
      break
    }
    case 'oklab': {
      luminanceFunc = luminanceOklab
      break
    }
    case 'wcag': {
      luminanceFunc = luminanceWCAG
      break
    }
    default: {
      luminanceFunc = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    }
  }

  for (let i = 0; i < pixelCount; i++) {
    const pixelIndex = i * 4
    const r = imageData[pixelIndex]
    const g = imageData[pixelIndex + 1]
    const b = imageData[pixelIndex + 2]

    luminanceData[i] = luminanceFunc(r, g, b)
  }

  return luminanceData
}

/**
 * Get luminance calculation performance characteristics
 */
export function getLuminanceMethodInfo(method: LuminanceMethod) {
  const methodInfo = {
    rec601: {
      name: 'ITU-R BT.601 (Legacy)',
      performance: 'Fastest',
      accuracy: 'Low',
      description: 'Based on old CRT displays, not perceptually uniform',
      recommended: false,
    },
    rec709: {
      name: 'ITU-R BT.709 (HD Standard)',
      performance: 'Very Fast',
      accuracy: 'Good',
      description: 'Modern standard for HD displays, good balance',
      recommended: true,
    },
    rec2020: {
      name: 'ITU-R BT.2020 (4K/HDR)',
      performance: 'Very Fast',
      accuracy: 'Good',
      description: 'For wide color gamut and HDR content',
      recommended: false,
    },
    linear: {
      name: 'Linear Luminance',
      performance: 'Fast',
      accuracy: 'Very Good',
      description: 'Gamma-corrected, mathematically accurate',
      recommended: true,
    },
    lab: {
      name: 'CIE Lab L*',
      performance: 'Slow',
      accuracy: 'Excellent',
      description: 'Perceptually uniform, excellent for edge detection',
      recommended: true,
    },
    oklab: {
      name: 'Oklab L',
      performance: 'Slow',
      accuracy: 'Excellent',
      description: 'Most modern, best perceptual uniformity',
      recommended: true,
    },
    wcag: {
      name: 'WCAG Relative Luminance',
      performance: 'Fast',
      accuracy: 'Very Good',
      description: 'Accessibility standard, good for contrast',
      recommended: false,
    },
  }

  return methodInfo[method]
}
