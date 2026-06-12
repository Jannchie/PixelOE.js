/**
 * Planar (SoA) image representation and fast color-space conversion.
 *
 * Hot paths operate on flat Float32Array planes instead of per-pixel
 * tuples to avoid allocation churn. sRGB gamma is handled via lookup
 * tables so no `Math.pow` is evaluated per pixel.
 */

/** Lab planes: l in [0, 100], a/b roughly in [-128, 128]. */
export interface LabPlanes {
  l: Float32Array
  a: Float32Array
  b: Float32Array
  alpha: Uint8ClampedArray
  width: number
  height: number
}

/** sRGB (0..255) -> linear (0..1) lookup table. */
const SRGB_TO_LINEAR = (() => {
  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const c = i / 255
    lut[i] = c > 0.040_45 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92
  }
  return lut
})()

/** linear (0..1) -> sRGB (0..255, unrounded) lookup table with linear interpolation. */
const LINEAR_TO_SRGB_SIZE = 8192
const LINEAR_TO_SRGB = (() => {
  const lut = new Float32Array(LINEAR_TO_SRGB_SIZE + 1)
  for (let i = 0; i <= LINEAR_TO_SRGB_SIZE; i++) {
    const c = i / LINEAR_TO_SRGB_SIZE
    lut[i] = (c > 0.003_130_8 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c) * 255
  }
  return lut
})()

function linearToSrgb255(c: number): number {
  if (c <= 0) {
    return 0
  }
  if (c >= 1) {
    return 255
  }
  const t = c * LINEAR_TO_SRGB_SIZE
  const i = Math.floor(t)
  const frac = t - i
  return LINEAR_TO_SRGB[i] * (1 - frac) + LINEAR_TO_SRGB[i + 1] * frac
}

const LAB_EPS = 0.008_856
const LAB_KAPPA_INV = 1 / 7.787

/**
 * cbrt lookup table for t in [LAB_EPS, 1] with linear interpolation.
 * Below LAB_EPS the exact linear branch is used, so the steep region of
 * cbrt near zero never hits the table (max interpolation error ~1e-6).
 */
const CBRT_LUT_SIZE = 8192
const CBRT_LUT = (() => {
  const lut = new Float32Array(CBRT_LUT_SIZE + 2)
  for (let i = 0; i <= CBRT_LUT_SIZE + 1; i++) {
    lut[i] = Math.cbrt(i / CBRT_LUT_SIZE)
  }
  return lut
})()

function labF(t: number): number {
  if (t <= LAB_EPS) {
    return 7.787 * t + 16 / 116
  }
  if (t >= 1) {
    return Math.cbrt(t)
  }
  const pos = t * CBRT_LUT_SIZE
  const i = Math.floor(pos)
  const frac = pos - i
  return CBRT_LUT[i] * (1 - frac) + CBRT_LUT[i + 1] * frac
}

function labFInv(t: number): number {
  return t > 0.206_893 ? t * t * t : (t - 16 / 116) * LAB_KAPPA_INV
}

/**
 * Convert interleaved RGBA data to Lab planes in a single pass.
 */
export function rgbaToLabPlanes(data: Uint8ClampedArray, width: number, height: number): LabPlanes {
  const n = width * height
  const l = new Float32Array(n)
  const a = new Float32Array(n)
  const b = new Float32Array(n)
  const alpha = new Uint8ClampedArray(n)

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const lr = SRGB_TO_LINEAR[data[p]]
    const lg = SRGB_TO_LINEAR[data[p + 1]]
    const lb = SRGB_TO_LINEAR[data[p + 2]]
    alpha[i] = data[p + 3]

    // sRGB D65 -> XYZ, pre-divided by white point
    const x = (lr * 0.412_456_4 + lg * 0.357_576_1 + lb * 0.180_437_5) / 0.950_47
    const y = lr * 0.212_672_9 + lg * 0.715_152_2 + lb * 0.072_175
    const z = (lr * 0.019_333_9 + lg * 0.119_192 + lb * 0.950_304_1) / 1.088_83

    const fx = labF(x)
    const fy = labF(y)
    const fz = labF(z)

    l[i] = 116 * fy - 16
    a[i] = 500 * (fx - fy)
    b[i] = 200 * (fy - fz)
  }

  return { l, a, b, alpha, width, height }
}

/**
 * Convert Lab planes back to interleaved RGBA data.
 */
export function labPlanesToRgba(planes: LabPlanes, out?: Uint8ClampedArray): Uint8ClampedArray {
  const { l, a, b, alpha, width, height } = planes
  const n = width * height
  const data = out ?? new Uint8ClampedArray(n * 4)

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const [
      r,
      g,
      bl,
    ] = labToLinearRgb(l[i], a[i], b[i])
    // Uint8ClampedArray clamps and rounds on store
    data[p] = linearToSrgb255(r)
    data[p + 1] = linearToSrgb255(g)
    data[p + 2] = linearToSrgb255(bl)
    data[p + 3] = alpha[i]
  }

  return data
}

/**
 * Affine per-channel transfer in Lab space, fused into a single pass over
 * RGBA data (no intermediate planes): L' = L*lScale + lOffset etc., with
 * the cv2-compatible clamps (L to [0,100], a/b to [-128,127]).
 */
export interface LabAffineTransfer {
  lScale: number
  lOffset: number
  aScale: number
  aOffset: number
  bScale: number
  bOffset: number
}

export function labStatTransfer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  t: LabAffineTransfer,
): Uint8ClampedArray {
  const n = width * height
  const out = new Uint8ClampedArray(n * 4)

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const lr = SRGB_TO_LINEAR[data[p]]
    const lg = SRGB_TO_LINEAR[data[p + 1]]
    const lb = SRGB_TO_LINEAR[data[p + 2]]

    const x = (lr * 0.412_456_4 + lg * 0.357_576_1 + lb * 0.180_437_5) / 0.950_47
    const y = lr * 0.212_672_9 + lg * 0.715_152_2 + lb * 0.072_175
    const z = (lr * 0.019_333_9 + lg * 0.119_192 + lb * 0.950_304_1) / 1.088_83

    const fx = labF(x)
    const fy = labF(y)
    const fz = labF(z)

    const l = 116 * fy - 16
    const a = 500 * (fx - fy)
    const b = 200 * (fy - fz)

    let newL = l * t.lScale + t.lOffset
    let newA = a * t.aScale + t.aOffset
    let newB = b * t.bScale + t.bOffset

    newL = newL < 0 ? 0 : (Math.min(newL, 100))
    newA = newA < -128 ? -128 : (Math.min(newA, 127))
    newB = newB < -128 ? -128 : (Math.min(newB, 127))

    const [
      r,
      g,
      bl,
    ] = labToLinearRgb(newL, newA, newB)
    out[p] = linearToSrgb255(r)
    out[p + 1] = linearToSrgb255(g)
    out[p + 2] = linearToSrgb255(bl)
    out[p + 3] = data[p + 3]
  }

  return out
}

/**
 * Single Lab value -> linear RGB (unclamped, 0..1 nominal range).
 */
function labToLinearRgb(l: number, a: number, b: number): [number, number, number] {
  const fy = (l + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200

  const x = labFInv(fx) * 0.950_47
  const y = labFInv(fy)
  const z = labFInv(fz) * 1.088_83

  return [
    x * 3.240_454_2 + y * -1.537_138_5 + z * -0.498_531_4,
    x * -0.969_266 + y * 1.876_010_8 + z * 0.041_556,
    x * 0.055_643_4 + y * -0.204_025_9 + z * 1.057_225_2,
  ]
}

/**
 * Single Lab value -> sRGB 0..255 (rounded), LUT-accelerated.
 */
export function labToRgb255(l: number, a: number, b: number): [number, number, number] {
  const [
    r,
    g,
    bl,
  ] = labToLinearRgb(l, a, b)
  return [
    Math.round(linearToSrgb255(r)),
    Math.round(linearToSrgb255(g)),
    Math.round(linearToSrgb255(bl)),
  ]
}

/**
 * Extract the Lab L channel normalized to [0, 1] (matching torch `l / 100`).
 */
export function rgbaToLabLuminance01(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const n = width * height
  const l = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const lr = SRGB_TO_LINEAR[data[p]]
    const lg = SRGB_TO_LINEAR[data[p + 1]]
    const lb = SRGB_TO_LINEAR[data[p + 2]]
    const y = lr * 0.212_672_9 + lg * 0.715_152_2 + lb * 0.072_175
    l[i] = (116 * labF(y) - 16) / 100
  }
  return l
}

/**
 * Strided variant of {@link rgbaToLabLuminance01}: samples one pixel at the
 * center of every stride×stride cell and converts only those, returning the
 * subsampled field and its dimensions.
 */
export function rgbaToLabLuminance01Strided(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  stride: number,
): { field: Float32Array, fieldWidth: number, fieldHeight: number } {
  const offset = stride >> 1
  const fieldWidth = Math.ceil(width / stride)
  const fieldHeight = Math.ceil(height / stride)
  const field = new Float32Array(fieldWidth * fieldHeight)

  for (let sy = 0; sy < fieldHeight; sy++) {
    const y = Math.min(height - 1, sy * stride + offset)
    const rowBase = y * width
    for (let sx = 0; sx < fieldWidth; sx++) {
      const x = Math.min(width - 1, sx * stride + offset)
      const p = (rowBase + x) * 4
      const lr = SRGB_TO_LINEAR[data[p]]
      const lg = SRGB_TO_LINEAR[data[p + 1]]
      const lb = SRGB_TO_LINEAR[data[p + 2]]
      const y2 = lr * 0.212_672_9 + lg * 0.715_152_2 + lb * 0.072_175
      field[sy * fieldWidth + sx] = (116 * labF(y2) - 16) / 100
    }
  }

  return { field, fieldWidth, fieldHeight }
}
