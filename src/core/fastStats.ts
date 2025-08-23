import type { PixelImageData } from './imageData'

/**
 * Fast statistical algorithms optimized for image processing
 */

/**
 * Fast histogram-based median calculation
 */
export class HistogramMedianCalculator {
  private histogram: Uint32Array
  private bins: number
  private minValue: number
  private maxValue: number
  private binSize: number

  constructor(bins: number = 256, minValue: number = 0, maxValue: number = 1) {
    this.bins = bins
    this.minValue = minValue
    this.maxValue = maxValue
    this.binSize = (maxValue - minValue) / bins
    this.histogram = new Uint32Array(bins)
  }

  /**
   * Reset histogram for new calculation
   */
  reset(): void {
    this.histogram.fill(0)
  }

  /**
   * Add value to histogram
   */
  addValue(value: number): void {
    const binIndex = Math.min(
      Math.max(
        Math.floor((value - this.minValue) / this.binSize),
        0,
      ),
      this.bins - 1,
    )
    this.histogram[binIndex]++
  }

  /**
   * Calculate median from current histogram
   */
  calculateMedian(totalCount: number): number {
    const halfCount = totalCount / 2

    let cumulativeCount = 0
    for (let i = 0; i < this.bins; i++) {
      cumulativeCount += this.histogram[i]

      if (cumulativeCount >= halfCount) {
        // Return center of bin
        return this.minValue + (i + 0.5) * this.binSize
      }
    }

    // Fallback
    return (this.minValue + this.maxValue) / 2
  }

  /**
   * Calculate median from array of values using histogram
   */
  fastMedian(values: Float32Array, count: number): number {
    this.reset()

    for (let i = 0; i < count; i++) {
      this.addValue(values[i])
    }

    return this.calculateMedian(count)
  }
}

/**
 * Sliding window histogram for efficient median calculation
 */
export class SlidingHistogram {
  private histogram: Uint32Array
  private bins: number
  private minValue: number
  private maxValue: number
  private binSize: number
  private totalCount: number

  constructor(bins: number = 256, minValue: number = 0, maxValue: number = 1) {
    this.bins = bins
    this.minValue = minValue
    this.maxValue = maxValue
    this.binSize = (maxValue - minValue) / bins
    this.histogram = new Uint32Array(bins)
    this.totalCount = 0
  }

  /**
   * Add value to sliding window
   */
  addValue(value: number): void {
    const binIndex = Math.min(
      Math.max(
        Math.floor((value - this.minValue) / this.binSize),
        0,
      ),
      this.bins - 1,
    )
    this.histogram[binIndex]++
    this.totalCount++
  }

  /**
   * Remove value from sliding window
   */
  removeValue(value: number): void {
    const binIndex = Math.min(
      Math.max(
        Math.floor((value - this.minValue) / this.binSize),
        0,
      ),
      this.bins - 1,
    )
    if (this.histogram[binIndex] > 0) {
      this.histogram[binIndex]--
      this.totalCount--
    }
  }

  /**
   * Get current median
   */
  getMedian(): number {
    if (this.totalCount === 0)
      return (this.minValue + this.maxValue) / 2

    const halfCount = this.totalCount / 2
    let cumulativeCount = 0

    for (let i = 0; i < this.bins; i++) {
      cumulativeCount += this.histogram[i]

      if (cumulativeCount >= halfCount) {
        return this.minValue + (i + 0.5) * this.binSize
      }
    }

    return (this.minValue + this.maxValue) / 2
  }

  /**
   * Reset the sliding window
   */
  reset(): void {
    this.histogram.fill(0)
    this.totalCount = 0
  }
}

/**
 * Fast separable convolution for statistics calculation
 */
export class SeparableStatsCalculator {
  // Note: tempRow and tempCol are reserved for future separable convolution optimizations
  // private tempRow: Float32Array
  // private tempCol: Float32Array

  constructor(_maxSize: number = 2048) {
    // this.tempRow = new Float32Array(_maxSize)
    // this.tempCol = new Float32Array(_maxSize)
  }

  /**
   * Apply horizontal box filter (sum)
   */
  private horizontalBoxSum(
    input: Float32Array,
    output: Float32Array,
    width: number,
    height: number,
    radius: number,
  ): void {
    for (let y = 0; y < height; y++) {
      const rowStart = y * width
      let sum = 0
      let count = 0

      // Initialize window
      for (let x = 0; x <= Math.min(radius, width - 1); x++) {
        sum += input[rowStart + x]
        count++
      }
      output[rowStart] = sum

      // Sliding window
      for (let x = 1; x < width; x++) {
        // Add right element if within bounds
        if (x + radius < width) {
          sum += input[rowStart + x + radius]
          count++
        }

        // Remove left element if beyond radius
        if (x - radius - 1 >= 0) {
          sum -= input[rowStart + x - radius - 1]
          count--
        }

        output[rowStart + x] = sum
      }
    }
  }

  /**
   * Apply vertical box filter (sum)
   */
  private verticalBoxSum(
    input: Float32Array,
    output: Float32Array,
    width: number,
    height: number,
    radius: number,
  ): void {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0

      // Initialize window
      for (let y = 0; y <= Math.min(radius, height - 1); y++) {
        sum += input[y * width + x]
        count++
      }
      output[x] = sum

      // Sliding window
      for (let y = 1; y < height; y++) {
        // Add bottom element if within bounds
        if (y + radius < height) {
          sum += input[(y + radius) * width + x]
          count++
        }

        // Remove top element if beyond radius
        if (y - radius - 1 >= 0) {
          sum -= input[(y - radius - 1) * width + x]
          count--
        }

        output[y * width + x] = sum
      }
    }
  }

  /**
   * Calculate fast box-filtered statistics using separable convolution
   */
  calculateBoxStats(
    grayData: Float32Array,
    width: number,
    height: number,
    radius: number,
  ): { sum: Float32Array, count: Float32Array } {
    const pixelCount = width * height
    const sum = new Float32Array(pixelCount)
    const count = new Float32Array(pixelCount)

    // Create count image (all ones for simple case)
    const ones = new Float32Array(pixelCount).fill(1)

    // Apply separable box filter
    // Horizontal pass for sum
    this.horizontalBoxSum(grayData, sum, width, height, radius)
    this.verticalBoxSum(sum, sum, width, height, radius)

    // Horizontal pass for count
    this.horizontalBoxSum(ones, count, width, height, radius)
    this.verticalBoxSum(count, count, width, height, radius)

    return { sum, count }
  }
}

/**
 * Ultra-fast approximate median using histogram sampling
 */
export function fastApproximateMedian(
  values: Float32Array,
  count: number,
  sampleRate: number = 0.1,
): number {
  if (count <= 0)
    return 0

  // For small arrays, use direct sorting
  if (count <= 50) {
    const sorted = [...values.subarray(0, count)].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
  }

  // Sample for large arrays
  const sampleSize = Math.max(20, Math.floor(count * sampleRate))
  const step = Math.floor(count / sampleSize)
  const samples: number[] = []

  for (let i = 0; i < count; i += step) {
    samples.push(values[i])
  }

  samples.sort((a, b) => a - b)
  const mid = Math.floor(samples.length / 2)
  return samples.length % 2 === 0
    ? (samples[mid - 1] + samples[mid]) / 2
    : samples[mid]
}

/**
 * Optimized combined statistics calculation with fast median
 */
export function calculateFastCombinedStats(
  imageData: PixelImageData,
  patchSize: number,
  medianPatchSize: number,
  stride: number,
  processingMask?: Uint8Array,
): { median: Float32Array, max: Float32Array, min: Float32Array } {
  console.log(`⚡ Starting FAST combined stats calculation`)
  const startTime = performance.now()

  const width = imageData.width
  const height = imageData.height
  const pixelCount = width * height

  const median = new Float32Array(pixelCount)
  const max = new Float32Array(pixelCount)
  const min = new Float32Array(pixelCount)

  // Convert to grayscale once
  const rawData = imageData.toCanvasImageData().data
  const grayData = new Float32Array(pixelCount)

  for (let i = 0; i < pixelCount; i++) {
    const pixelIndex = i * 4
    grayData[i] = (
      0.299 * rawData[pixelIndex]
      + 0.587 * rawData[pixelIndex + 1]
      + 0.114 * rawData[pixelIndex + 2]
    ) / 255
  }

  // Use separable convolution for box statistics where possible (currently unused)
  // const statsCalc = new SeparableStatsCalculator(Math.max(width, height))
  // const medianCalc = new HistogramMedianCalculator(128, 0, 1)

  // Pre-allocate patch buffer
  const maxPatchSize = medianPatchSize * medianPatchSize
  const patchValues = new Float32Array(maxPatchSize)

  const halfPatch = Math.floor(patchSize / 2)
  const halfMedianPatch = Math.floor(medianPatchSize / 2)

  let processedPixels = 0
  let skippedPixels = 0

  // Process in chunks with stride
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const centerIdx = y * width + x

      // Skip if processing mask indicates no processing needed
      if (processingMask && processingMask[centerIdx] === 0) {
        skippedPixels++
        continue
      }

      processedPixels++

      // Fast median calculation with histogram
      let medianPatchCount = 0
      for (let py = y - halfMedianPatch; py <= y + halfMedianPatch; py++) {
        for (let px = x - halfMedianPatch; px <= x + halfMedianPatch; px++) {
          const clampedX = Math.max(0, Math.min(px, width - 1))
          const clampedY = Math.max(0, Math.min(py, height - 1))
          patchValues[medianPatchCount++] = grayData[clampedY * width + clampedX]
        }
      }

      // Use fast approximate median
      const medianValue = fastApproximateMedian(patchValues, medianPatchCount, 0.2)

      // Calculate min/max efficiently
      let patchMin = 1
      let patchMax = 0

      for (let py = y - halfPatch; py <= y + halfPatch; py++) {
        for (let px = x - halfPatch; px <= x + halfPatch; px++) {
          const clampedX = Math.max(0, Math.min(px, width - 1))
          const clampedY = Math.max(0, Math.min(py, height - 1))
          const value = grayData[clampedY * width + clampedX]

          if (value < patchMin)
            patchMin = value
          if (value > patchMax)
            patchMax = value
        }
      }

      // Fill results in stride area
      for (let dy = 0; dy < stride && y + dy < height; dy++) {
        for (let dx = 0; dx < stride && x + dx < width; dx++) {
          const idx = (y + dy) * width + (x + dx)
          median[idx] = medianValue
          max[idx] = patchMax
          min[idx] = patchMin
        }
      }
    }
  }

  const endTime = performance.now()
  console.log(`✅ Fast combined stats completed in ${(endTime - startTime).toFixed(1)}ms`)
  console.log(`📊 Processed: ${processedPixels} chunks, Skipped: ${skippedPixels} chunks`)

  return { median, max, min }
}

/**
 * Ultra-optimized separable convolution-based statistics
 */
export function calculateSeparableStats(
  imageData: PixelImageData,
  patchSize: number,
  _processingMask?: Uint8Array,
): { mean: Float32Array, variance: Float32Array } {
  console.log(`⚡ Starting separable convolution statistics`)
  const startTime = performance.now()

  const width = imageData.width
  const height = imageData.height
  const pixelCount = width * height

  // Convert to grayscale
  const rawData = imageData.toCanvasImageData().data
  const grayData = new Float32Array(pixelCount)

  for (let i = 0; i < pixelCount; i++) {
    const pixelIndex = i * 4
    grayData[i] = (
      0.299 * rawData[pixelIndex]
      + 0.587 * rawData[pixelIndex + 1]
      + 0.114 * rawData[pixelIndex + 2]
    ) / 255
  }

  // Create separable calculator
  const statsCalc = new SeparableStatsCalculator(Math.max(width, height))
  const radius = Math.floor(patchSize / 2)

  // Calculate box-filtered statistics
  const boxStats = statsCalc.calculateBoxStats(grayData, width, height, radius)

  // Calculate mean and variance
  const mean = new Float32Array(pixelCount)
  const variance = new Float32Array(pixelCount)

  for (let i = 0; i < pixelCount; i++) {
    mean[i] = boxStats.count[i] > 0 ? boxStats.sum[i] / boxStats.count[i] : 0
  }

  // Calculate variance using separable convolution for squared values
  const graySquared = new Float32Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    graySquared[i] = grayData[i] * grayData[i]
  }

  const squaredStats = statsCalc.calculateBoxStats(graySquared, width, height, radius)

  for (let i = 0; i < pixelCount; i++) {
    if (boxStats.count[i] > 0) {
      const meanSquared = squaredStats.sum[i] / squaredStats.count[i]
      const meanValue = mean[i]
      variance[i] = Math.max(0, meanSquared - meanValue * meanValue)
    }
    else {
      variance[i] = 0
    }
  }

  const endTime = performance.now()
  console.log(`✅ Separable statistics completed in ${(endTime - startTime).toFixed(1)}ms`)

  return { mean, variance }
}

/**
 * Advanced edge-aware separable processing
 */
export function calculateAdvancedSeparableStats(
  imageData: PixelImageData,
  patchSize: number,
  medianPatchSize: number,
  processingMask?: Uint8Array,
): { median: Float32Array, max: Float32Array, min: Float32Array, mean: Float32Array, stddev: Float32Array } {
  console.log(`🔬 Starting advanced separable statistics`)
  const startTime = performance.now()

  const width = imageData.width
  const height = imageData.height
  const pixelCount = width * height

  // Initialize results
  const median = new Float32Array(pixelCount)
  const max = new Float32Array(pixelCount)
  const min = new Float32Array(pixelCount)
  const mean = new Float32Array(pixelCount)
  const stddev = new Float32Array(pixelCount)

  // Convert to grayscale
  const rawData = imageData.toCanvasImageData().data
  const grayData = new Float32Array(pixelCount)

  for (let i = 0; i < pixelCount; i++) {
    const pixelIndex = i * 4
    grayData[i] = (
      0.299 * rawData[pixelIndex]
      + 0.587 * rawData[pixelIndex + 1]
      + 0.114 * rawData[pixelIndex + 2]
    ) / 255
  }

  // Use separable convolution for mean (fast)
  const separableStats = calculateSeparableStats(imageData, patchSize)

  // Copy mean and calculate standard deviation
  for (let i = 0; i < pixelCount; i++) {
    mean[i] = separableStats.mean[i]
    stddev[i] = Math.sqrt(separableStats.variance[i])
  }

  // For median, min, max - use selective processing based on mask
  // const medianCalc = new HistogramMedianCalculator(128, 0, 1)
  // const halfPatch = Math.floor(patchSize / 2)
  const halfMedianPatch = Math.floor(medianPatchSize / 2)
  const patchValues = new Float32Array(medianPatchSize * medianPatchSize)

  let processedPixels = 0
  let skippedPixels = 0

  for (let y = halfMedianPatch; y < height - halfMedianPatch; y++) {
    for (let x = halfMedianPatch; x < width - halfMedianPatch; x++) {
      const idx = y * width + x

      if (processingMask && processingMask[idx] === 0) {
        skippedPixels++
        // Use mean as median approximation for non-critical areas
        median[idx] = mean[idx]
        min[idx] = Math.max(0, mean[idx] - stddev[idx])
        max[idx] = Math.min(1, mean[idx] + stddev[idx])
        continue
      }

      processedPixels++

      // Accurate median calculation for critical areas
      let patchCount = 0
      let patchMin = 1
      let patchMax = 0

      for (let py = y - halfMedianPatch; py <= y + halfMedianPatch; py++) {
        for (let px = x - halfMedianPatch; px <= x + halfMedianPatch; px++) {
          const clampedX = Math.max(0, Math.min(px, width - 1))
          const clampedY = Math.max(0, Math.min(py, height - 1))
          const value = grayData[clampedY * width + clampedX]

          patchValues[patchCount++] = value
          if (value < patchMin)
            patchMin = value
          if (value > patchMax)
            patchMax = value
        }
      }

      median[idx] = fastApproximateMedian(patchValues, patchCount, 0.3)
      min[idx] = patchMin
      max[idx] = patchMax
    }
  }

  const endTime = performance.now()
  console.log(`✅ Advanced separable statistics: ${(endTime - startTime).toFixed(1)}ms`)
  console.log(`📊 Processed: ${processedPixels}, Skipped: ${skippedPixels} (${(skippedPixels / (processedPixels + skippedPixels) * 100).toFixed(1)}% skipped)`)

  return { median, max, min, mean, stddev }
}

/**
 * Integral image for constant-time rectangular sums
 */
export class IntegralImage {
  private integralSum: Float32Array
  private integralCount: Uint32Array
  private width: number
  private height: number

  constructor(grayData: Float32Array, width: number, height: number) {
    this.width = width
    this.height = height
    this.integralSum = new Float32Array((width + 1) * (height + 1))
    this.integralCount = new Uint32Array((width + 1) * (height + 1))

    this.buildIntegralImage(grayData)
  }

  private buildIntegralImage(grayData: Float32Array): void {
    const w = this.width + 1

    for (let y = 1; y <= this.height; y++) {
      for (let x = 1; x <= this.width; x++) {
        const value = grayData[(y - 1) * this.width + (x - 1)]
        const idx = y * w + x

        this.integralSum[idx] = value
          + this.integralSum[(y - 1) * w + x]
          + this.integralSum[y * w + (x - 1)]
          - this.integralSum[(y - 1) * w + (x - 1)]

        this.integralCount[idx] = 1
          + this.integralCount[(y - 1) * w + x]
          + this.integralCount[y * w + (x - 1)]
          - this.integralCount[(y - 1) * w + (x - 1)]
      }
    }
  }

  /**
   * Get sum of rectangle (x1,y1) to (x2,y2) in O(1) time
   */
  getRectangleSum(x1: number, y1: number, x2: number, y2: number): number {
    const w = this.width + 1

    // Clamp coordinates
    x1 = Math.max(0, Math.min(x1, this.width - 1)) + 1
    y1 = Math.max(0, Math.min(y1, this.height - 1)) + 1
    x2 = Math.max(0, Math.min(x2, this.width - 1)) + 1
    y2 = Math.max(0, Math.min(y2, this.height - 1)) + 1

    return this.integralSum[y2 * w + x2]
      - this.integralSum[(y1 - 1) * w + x2]
      - this.integralSum[y2 * w + (x1 - 1)]
      + this.integralSum[(y1 - 1) * w + (x1 - 1)]
  }

  /**
   * Get count of rectangle
   */
  getRectangleCount(x1: number, y1: number, x2: number, y2: number): number {
    const w = this.width + 1

    x1 = Math.max(0, Math.min(x1, this.width - 1)) + 1
    y1 = Math.max(0, Math.min(y1, this.height - 1)) + 1
    x2 = Math.max(0, Math.min(x2, this.width - 1)) + 1
    y2 = Math.max(0, Math.min(y2, this.height - 1)) + 1

    return this.integralCount[y2 * w + x2]
      - this.integralCount[(y1 - 1) * w + x2]
      - this.integralCount[y2 * w + (x1 - 1)]
      + this.integralCount[(y1 - 1) * w + (x1 - 1)]
  }

  /**
   * Get mean of rectangle in O(1) time
   */
  getRectangleMean(x1: number, y1: number, x2: number, y2: number): number {
    const sum = this.getRectangleSum(x1, y1, x2, y2)
    const count = this.getRectangleCount(x1, y1, x2, y2)
    return count > 0 ? sum / count : 0
  }
}
