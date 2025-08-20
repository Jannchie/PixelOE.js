<template>
  <div class="performance-comparison">
    <h2 class="text-2xl font-bold mb-6">🚀 PixelOE Performance Optimization Results</h2>
    
    <!-- Test Controls -->
    <div class="test-controls mb-6 p-4 bg-gray-100 rounded-lg">
      <h3 class="text-lg font-semibold mb-3">Performance Test Controls</h3>
      <div class="flex flex-wrap gap-4 items-center">
        <label>
          Image Size:
          <select v-model="testConfig.imageSize" class="ml-2 px-2 py-1 border rounded">
            <option value="64">64x64</option>
            <option value="128">128x128</option>
            <option value="256">256x256</option>
          </select>
        </label>
        
        <label>
          Test Type:
          <select v-model="testConfig.testType" class="ml-2 px-2 py-1 border rounded">
            <option value="colorSpace">Color Space Conversion</option>
            <option value="blur">Gaussian Blur</option>
            <option value="quantization">Color Quantization</option>
            <option value="downscale">Image Downscaling</option>
          </select>
        </label>
        
        <label>
          Iterations:
          <input v-model.number="testConfig.iterations" type="number" min="1" max="100" 
                 class="ml-2 px-2 py-1 border rounded w-20">
        </label>
        
        <button @click="runPerformanceTest" :disabled="testing" 
                class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">
          {{ testing ? 'Testing...' : 'Run Test' }}
        </button>
      </div>
    </div>
    
    <!-- Results Display -->
    <div v-if="results.length > 0" class="results-section">
      <h3 class="text-xl font-semibold mb-4">📊 Performance Comparison Results</h3>
      
      <!-- Overall Summary -->
      <div class="summary-cards mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 class="font-semibold text-green-800">Overall Speedup</h4>
          <div class="text-2xl font-bold text-green-600">{{ overallSpeedup }}x</div>
          <div class="text-sm text-green-600">{{ overallImprovement }}</div>
        </div>
        
        <div class="card p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 class="font-semibold text-blue-800">Original Performance</h4>
          <div class="text-2xl font-bold text-blue-600">{{ averageOriginalTime }}ms</div>
          <div class="text-sm text-blue-600">{{ originalOpsPerSecond }} ops/s</div>
        </div>
        
        <div class="card p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h4 class="font-semibold text-purple-800">Optimized Performance</h4>
          <div class="text-2xl font-bold text-purple-600">{{ averageOptimizedTime }}ms</div>
          <div class="text-sm text-purple-600">{{ optimizedOpsPerSecond }} ops/s</div>
        </div>
      </div>
      
      <!-- Detailed Results -->
      <div class="detailed-results">
        <div v-for="(result, index) in results" :key="index" 
             class="result-item mb-4 p-4 border rounded-lg">
          <div class="flex justify-between items-center mb-2">
            <h4 class="font-semibold">{{ result.testName }}</h4>
            <div class="speedup-badge px-2 py-1 rounded text-sm font-bold"
                 :class="getSpeedupBadgeClass(result.speedup)">
              {{ result.speedup.toFixed(2) }}x {{ result.improvement }}
            </div>
          </div>
          
          <div class="performance-bars">
            <div class="bar-container mb-2">
              <div class="flex justify-between text-sm mb-1">
                <span>Original</span>
                <span>{{ result.original.averageTime.toFixed(3) }}ms</span>
              </div>
              <div class="bar bg-gray-200 h-2 rounded">
                <div class="bar-fill bg-blue-500 h-full rounded" 
                     :style="{ width: getBarWidth(result.original.averageTime, result.optimized.averageTime) + '%' }"></div>
              </div>
            </div>
            
            <div class="bar-container">
              <div class="flex justify-between text-sm mb-1">
                <span>Optimized</span>
                <span>{{ result.optimized.averageTime.toFixed(3) }}ms</span>
              </div>
              <div class="bar bg-gray-200 h-2 rounded">
                <div class="bar-fill bg-green-500 h-full rounded" 
                     :style="{ width: getBarWidth(result.optimized.averageTime, result.original.averageTime) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Chart Visualization -->
      <div class="chart-section mt-6">
        <h4 class="text-lg font-semibold mb-3">Performance Visualization</h4>
        <canvas ref="chartCanvas" width="600" height="300" 
                class="border border-gray-300 rounded-lg max-w-full"></canvas>
      </div>
    </div>
    
    <!-- Optimization Details -->
    <div class="optimization-details mt-8 p-4 bg-gray-50 rounded-lg">
      <h3 class="text-lg font-semibold mb-3">🔧 Optimization Techniques Used</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 class="font-medium mb-2">Color Space Optimization</h4>
          <ul class="text-sm list-disc list-inside text-gray-700">
            <li>Lookup tables for expensive math operations</li>
            <li>Batch processing for multiple pixels</li>
            <li>Reduced function call overhead</li>
          </ul>
        </div>
        
        <div>
          <h4 class="font-medium mb-2">Algorithm Optimization</h4>
          <ul class="text-sm list-disc list-inside text-gray-700">
            <li>TypedArrays for better memory access</li>
            <li>Squared distance instead of sqrt</li>
            <li>Early termination conditions</li>
          </ul>
        </div>
        
        <div>
          <h4 class="font-medium mb-2">Blur Optimization</h4>
          <ul class="text-sm list-disc list-inside text-gray-700">
            <li>Separable convolution filters</li>
            <li>Pre-computed kernel weights</li>
            <li>Optimized memory access patterns</li>
          </ul>
        </div>
        
        <div>
          <h4 class="font-medium mb-2">K-means Optimization</h4>
          <ul class="text-sm list-disc list-inside text-gray-700">
            <li>Batch distance calculations</li>
            <li>Improved initialization (K-means++)</li>
            <li>Memory-efficient centroid updates</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'

// Import original functions
import { rgbToLab, labToRgb } from '../core/colorSpace'
import { colorQuantizationKMeans } from '../core/quantization'
import { kCentroidDownscale } from '../core/downscale'

// Import optimized functions
import { rgbToLabOptimized, labToRgbOptimized, batchRgbToLabOptimized } from '../core/colorSpaceOptimized'
import { colorQuantizationKMeansOptimized } from '../core/quantizationOptimized'
import { kCentroidDownscaleOptimized } from '../core/downscaleOptimized'
import { simpleGaussianBlurOptimized, separableGaussianBlur } from '../core/blurOptimized'
import { PixelImageData } from '../core/imageData'

interface TestConfig {
  imageSize: number
  testType: string
  iterations: number
}

interface PerformanceResult {
  functionName: string
  iterations: number
  totalTime: number
  averageTime: number
  opsPerSecond: number
}

interface ComparisonResult {
  testName: string
  original: PerformanceResult
  optimized: PerformanceResult
  speedup: number
  improvement: string
}

const testConfig = ref<TestConfig>({
  imageSize: 128,
  testType: 'colorSpace',
  iterations: 50
})

const testing = ref(false)
const results = ref<ComparisonResult[]>([])
const chartCanvas = ref<HTMLCanvasElement | null>(null)

// Performance testing utilities
function benchmark<T extends any[], R>(
  fn: (...args: T) => R,
  args: T,
  iterations: number
): PerformanceResult {
  const startTime = performance.now()
  
  for (let i = 0; i < iterations; i++) {
    fn(...args)
  }
  
  const endTime = performance.now()
  const totalTime = endTime - startTime
  const averageTime = totalTime / iterations
  const opsPerSecond = 1000 / averageTime

  return {
    functionName: fn.name || 'anonymous',
    iterations,
    totalTime,
    averageTime,
    opsPerSecond
  }
}

function compare<T extends any[], R>(
  originalFn: (...args: T) => R,
  optimizedFn: (...args: T) => R,
  args: T,
  iterations: number,
  testName: string
): ComparisonResult {
  const original = benchmark(originalFn, args, iterations)
  const optimized = benchmark(optimizedFn, args, iterations)
  
  const speedup = original.averageTime / optimized.averageTime
  const improvement = speedup > 1 
    ? `${(speedup * 100 - 100).toFixed(1)}% faster`
    : `${(100 - speedup * 100).toFixed(1)}% slower`

  return {
    testName,
    original,
    optimized,
    speedup,
    improvement
  }
}

// Generate test data
function generateTestImage(size: number): PixelImageData {
  const imageData = new PixelImageData(size, size)
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.floor(Math.random() * 256)
      const g = Math.floor(Math.random() * 256)
      const b = Math.floor(Math.random() * 256)
      imageData.setPixel(x, y, [r, g, b, 255])
    }
  }
  
  return imageData
}

// Test runners
async function runColorSpaceTest(size: number, iterations: number): Promise<ComparisonResult[]> {
  const testResults: ComparisonResult[] = []
  
  // RGB to LAB test
  const rgbTestPixel: [number, number, number] = [128, 64, 192]
  testResults.push(compare(
    rgbToLab,
    rgbToLabOptimized,
    rgbTestPixel,
    iterations,
    'RGB → LAB Conversion'
  ))
  
  // LAB to RGB test
  const [l, a, bLab] = rgbToLab(...rgbTestPixel)
  testResults.push(compare(
    labToRgb,
    labToRgbOptimized,
    [l, a, bLab],
    iterations,
    'LAB → RGB Conversion'
  ))
  
  // Batch processing test
  const batchPixels = Array.from({ length: size }, () => [
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256)
  ])
  
  testResults.push(compare(
    (pixels: number[][]) => pixels.map(([r, g, b]) => rgbToLab(r, g, b)),
    batchRgbToLabOptimized,
    [batchPixels],
    Math.max(1, Math.floor(iterations / 10)),
    'Batch RGB → LAB Processing'
  ))
  
  return testResults
}

async function runBlurTest(size: number, iterations: number): Promise<ComparisonResult[]> {
  const testChannel = new Float32Array(size * size)
  for (let i = 0; i < testChannel.length; i++) {
    testChannel[i] = Math.random() * 255
  }
  
  const originalBlur = (channel: Float32Array, w: number, h: number, r: number) => {
    // Simple implementation for comparison
    const result = new Float32Array(channel.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0
        for (let ky = -r; ky <= r; ky++) {
          for (let kx = -r; kx <= r; kx++) {
            const nx = Math.max(0, Math.min(w - 1, x + kx))
            const ny = Math.max(0, Math.min(h - 1, y + ky))
            sum += channel[ny * w + nx]
            count++
          }
        }
        result[y * w + x] = sum / count
      }
    }
    return result
  }
  
  return [
    compare(
      originalBlur,
      simpleGaussianBlurOptimized,
      [testChannel, size, size, 3],
      Math.max(1, Math.floor(iterations / 5)),
      'Gaussian Blur (Standard)'
    ),
    compare(
      originalBlur,
      separableGaussianBlur,
      [testChannel, size, size, 3],
      Math.max(1, Math.floor(iterations / 5)),
      'Separable Gaussian Blur'
    )
  ]
}

async function runQuantizationTest(size: number, iterations: number): Promise<ComparisonResult[]> {
  const testImage = generateTestImage(size)
  
  return [
    compare(
      (img) => colorQuantizationKMeans(img, { numCentroids: 16 }),
      (img) => colorQuantizationKMeansOptimized(img, { numCentroids: 16 }),
      [testImage],
      Math.max(1, Math.floor(iterations / 10)),
      'Color Quantization (K-means)'
    )
  ]
}

async function runDownscaleTest(size: number, iterations: number): Promise<ComparisonResult[]> {
  const testImage = generateTestImage(size)
  const targetSize = Math.floor(size * size / 4) // Quarter the total pixels
  
  return [
    compare(
      (img) => kCentroidDownscale(img, targetSize, 3),
      (img) => kCentroidDownscaleOptimized(img, targetSize, 3),
      [testImage],
      Math.max(1, Math.floor(iterations / 10)),
      'K-Centroid Downscaling'
    )
  ]
}

// Run performance test
async function runPerformanceTest() {
  testing.value = true
  results.value = []
  
  try {
    const { imageSize, testType, iterations } = testConfig.value
    
    switch (testType) {
      case 'colorSpace':
        results.value = await runColorSpaceTest(imageSize, iterations)
        break
      case 'blur':
        results.value = await runBlurTest(imageSize, iterations)
        break
      case 'quantization':
        results.value = await runQuantizationTest(imageSize, iterations)
        break
      case 'downscale':
        results.value = await runDownscaleTest(imageSize, iterations)
        break
    }
    
    await nextTick()
    drawChart()
    
  } catch (error) {
    console.error('Performance test failed:', error)
  } finally {
    testing.value = false
  }
}

// Computed properties
const overallSpeedup = computed(() => {
  if (results.value.length === 0) return 0
  const avgSpeedup = results.value.reduce((sum, r) => sum + r.speedup, 0) / results.value.length
  return avgSpeedup.toFixed(2)
})

const overallImprovement = computed(() => {
  const speedup = Number(overallSpeedup.value)
  return speedup > 1 
    ? `${((speedup - 1) * 100).toFixed(1)}% faster`
    : `${((1 - speedup) * 100).toFixed(1)}% slower`
})

const averageOriginalTime = computed(() => {
  if (results.value.length === 0) return 0
  const avg = results.value.reduce((sum, r) => sum + r.original.averageTime, 0) / results.value.length
  return avg.toFixed(3)
})

const averageOptimizedTime = computed(() => {
  if (results.value.length === 0) return 0
  const avg = results.value.reduce((sum, r) => sum + r.optimized.averageTime, 0) / results.value.length
  return avg.toFixed(3)
})

const originalOpsPerSecond = computed(() => {
  if (results.value.length === 0) return 0
  const avg = results.value.reduce((sum, r) => sum + r.original.opsPerSecond, 0) / results.value.length
  return Math.round(avg).toLocaleString()
})

const optimizedOpsPerSecond = computed(() => {
  if (results.value.length === 0) return 0
  const avg = results.value.reduce((sum, r) => sum + r.optimized.opsPerSecond, 0) / results.value.length
  return Math.round(avg).toLocaleString()
})

// Helper functions
function getSpeedupBadgeClass(speedup: number) {
  if (speedup >= 2) return 'bg-green-100 text-green-800'
  if (speedup >= 1.2) return 'bg-blue-100 text-blue-800'
  if (speedup >= 1) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

function getBarWidth(time: number, compareTime: number): number {
  const maxTime = Math.max(time, compareTime)
  return (time / maxTime) * 100
}

// Chart drawing
function drawChart() {
  const canvas = chartCanvas.value
  if (!canvas || results.value.length === 0) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const width = canvas.width
  const height = canvas.height
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height)
  
  // Chart margins
  const margin = { top: 20, right: 20, bottom: 60, left: 80 }
  const chartWidth = width - margin.left - margin.right
  const chartHeight = height - margin.top - margin.bottom
  
  // Data preparation
  const maxTime = Math.max(
    ...results.value.map(r => Math.max(r.original.averageTime, r.optimized.averageTime))
  )
  
  const barWidth = chartWidth / (results.value.length * 2)
  
  // Draw bars
  results.value.forEach((result, index) => {
    const x = margin.left + index * barWidth * 2
    
    // Original bar
    const originalHeight = (result.original.averageTime / maxTime) * chartHeight
    ctx.fillStyle = '#3B82F6'
    ctx.fillRect(x, margin.top + chartHeight - originalHeight, barWidth * 0.8, originalHeight)
    
    // Optimized bar
    const optimizedHeight = (result.optimized.averageTime / maxTime) * chartHeight
    ctx.fillStyle = '#10B981'
    ctx.fillRect(x + barWidth, margin.top + chartHeight - optimizedHeight, barWidth * 0.8, optimizedHeight)
  })
  
  // Draw labels
  ctx.fillStyle = '#374151'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  
  results.value.forEach((result, index) => {
    const x = margin.left + index * barWidth * 2 + barWidth
    ctx.fillText(
      result.testName.length > 15 ? result.testName.substring(0, 12) + '...' : result.testName,
      x,
      height - 10
    )
  })
  
  // Legend
  ctx.fillStyle = '#3B82F6'
  ctx.fillRect(width - 150, 10, 20, 15)
  ctx.fillStyle = '#374151'
  ctx.textAlign = 'left'
  ctx.fillText('Original', width - 125, 22)
  
  ctx.fillStyle = '#10B981'
  ctx.fillRect(width - 150, 30, 20, 15)
  ctx.fillStyle = '#374151'
  ctx.fillText('Optimized', width - 125, 42)
}
</script>

<style scoped>
.performance-comparison {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Inter', sans-serif;
}

.bar-container {
  position: relative;
}

.bar {
  position: relative;
  overflow: hidden;
}

.bar-fill {
  transition: width 0.5s ease;
}
</style>