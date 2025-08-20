/**
 * Color space conversion utilities
 */

/**
 * Convert RGB to LAB color space
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // Normalize RGB values to [0, 1]
  r = r / 255
  g = g / 255
  b = b / 255

  // Apply gamma correction
  r = r > 0.040_45 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92
  g = g > 0.040_45 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92
  b = b > 0.040_45 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92

  // Convert to XYZ color space (D65 illuminant)
  let x = r * 0.412_456_4 + g * 0.357_576_1 + b * 0.180_437_5
  let y = r * 0.212_672_9 + g * 0.715_152_2 + b * 0.072_175
  let z = r * 0.019_333_9 + g * 0.119_192 + b * 0.950_304_1

  // Normalize by D65 white point
  x = x / 0.950_47
  y = y / 1
  z = z / 1.088_83

  // Convert XYZ to LAB
  const fx = x > 0.008_856 ? x ** (1 / 3) : (7.787 * x + 16 / 116)
  const fy = y > 0.008_856 ? y ** (1 / 3) : (7.787 * y + 16 / 116)
  const fz = z > 0.008_856 ? z ** (1 / 3) : (7.787 * z + 16 / 116)

  const l = 116 * fy - 16
  const a = 500 * (fx - fy)
  const bLab = 200 * (fy - fz)

  return [l, a, bLab]
}

/**
 * Convert LAB to RGB color space
 */
export function labToRgb(l: number, a: number, b: number): [number, number, number] {
  let y = (l + 16) / 116
  let x = a / 500 + y
  let z = y - b / 200

  // Convert back to XYZ
  x = x > 0.206_893 ? x ** 3 : (x - 16 / 116) / 7.787
  y = y > 0.206_893 ? y ** 3 : (y - 16 / 116) / 7.787
  z = z > 0.206_893 ? z ** 3 : (z - 16 / 116) / 7.787

  // Apply D65 white point
  x = x * 0.950_47
  y = y * 1
  z = z * 1.088_83

  // Convert XYZ to RGB
  let r = x * 3.240_454_2 + y * -1.537_138_5 + z * -0.498_531_4
  let g = x * -0.969_266 + y * 1.876_010_8 + z * 0.041_556
  let bRgb = x * 0.055_643_4 + y * -0.204_025_9 + z * 1.057_225_2

  // Apply inverse gamma correction
  r = r > 0.003_130_8 ? 1.055 * r ** (1 / 2.4) - 0.055 : 12.92 * r
  g = g > 0.003_130_8 ? 1.055 * g ** (1 / 2.4) - 0.055 : 12.92 * g
  bRgb = bRgb > 0.003_130_8 ? 1.055 * bRgb ** (1 / 2.4) - 0.055 : 12.92 * bRgb

  // Convert to [0, 255] range and clamp
  return [
    Math.max(0, Math.min(255, Math.round(r * 255))),
    Math.max(0, Math.min(255, Math.round(g * 255))),
    Math.max(0, Math.min(255, Math.round(bRgb * 255))),
  ]
}

/**
 * Convert RGB to HSV color space
 */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const diff = max - min

  let h = 0
  const s = max === 0 ? 0 : diff / max
  const v = max

  if (diff !== 0) {
    if (max === r) {
      h = ((g - b) / diff) % 6
    }
    else if (max === g) {
      h = (b - r) / diff + 2
    }
    else {
      h = (r - g) / diff + 4
    }
    h *= 60
    if (h < 0) {
      h += 360
    }
  }

  return [h, s, v]
}

/**
 * Convert HSV to RGB color space
 */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = v - c

  let r = 0; let g = 0; let b = 0

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0
  }
  else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0
  }
  else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x
  }
  else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c
  }
  else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c
  }
  else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}
