<script setup lang="ts">
import type { PixelImageData, PixelOEOptions } from '../index'
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { PixelOE } from '../index'

// Reactive state
const fileInput = ref<HTMLInputElement>()
const fileInputMain = ref<HTMLInputElement>()
const originalCanvas = ref<HTMLCanvasElement>()
const resultCanvas = ref<HTMLCanvasElement>()

const originalImage = ref<PixelImageData | null>(null)
const resultImage = ref<PixelImageData | null>(null)
const processing = ref(false)
const showSettings = ref(false)
const showingOriginal = ref(false)

const options = reactive<PixelOEOptions>({
  pixelSize: 8, // patch_size: 更大的默认像素大小
  thickness: 2, // thickness: 回到 legacy 行为
  targetSize: 256, // target_size: 目标尺寸 (matching demo)
  mode: 'contrast', // 最佳质量模式
  colorMatching: true,
  contrast: 1, // 默认对比度
  saturation: 1, // 默认饱和度
  noUpscale: false,
  noDownscale: false,
  kCentroids: 3, // 更好的聚类效果
})

// Simplified mode options
const simpleModes = [
  {
    value: 'contrast',
    label: 'Smart',
    description: 'AI-powered intelligent selection',
  },
  {
    value: 'center',
    label: 'Center',
    description: 'Simple center-based sampling',
  },
  {
    value: 'k-centroid',
    label: 'Cluster',
    description: 'Color clustering algorithm',
  },
  {
    value: 'nearest',
    label: 'Fast',
    description: 'Quick nearest neighbor',
  },
  {
    value: 'bilinear',
    label: 'Smooth',
    description: 'Smooth interpolation',
  },
]

// Create PixelOE instance
let pixelOE: PixelOE

// Store the paste handler for cleanup
let pasteHandler: ((event: ClipboardEvent) => void) | null = null

onMounted(() => {
  pixelOE = new PixelOE(options)

  // Add paste event listener
  pasteHandler = (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) {
      return
    }

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          handlePastedImage(file)
        }
        break
      }
    }
  }

  document.addEventListener('paste', pasteHandler)
})

onUnmounted(() => {
  if (pasteHandler) {
    document.removeEventListener('paste', pasteHandler)
  }
})

// Event handlers
async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) {
    return
  }

  try {
    originalImage.value = await pixelOE.loadImage(file)
    await nextTick()
    drawOriginalImage()
    resultImage.value = null // Clear previous result
  }
  catch (error) {
    console.error('Error loading image:', error)
    alert('Failed to load image, please try again')
  }
}

async function handlePastedImage(file: File) {
  try {
    originalImage.value = await pixelOE.loadImage(file)
    await nextTick()
    drawOriginalImage()
    resultImage.value = null // Clear previous result
  }
  catch (error) {
    console.error('Error loading pasted image:', error)
    alert('Failed to load pasted image, please try again')
  }
}

function handleOptionsChange() {
  pixelOE.setOptions(options)
}

async function processImage() {
  if (!originalImage.value) {
    return
  }

  processing.value = true

  try {
    // Use setTimeout to allow UI to update
    await new Promise(resolve => setTimeout(resolve, 100))

    // Process in chunks to avoid blocking UI
    const result = await processImageAsync(originalImage.value)
    resultImage.value = result.result

    await nextTick()
    drawResultImage()
  }
  catch (error) {
    console.error('Error processing image:', error)
    alert(`Processing failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  finally {
    processing.value = false
  }
}

// Async wrapper to prevent UI blocking
async function processImageAsync(imageData: PixelImageData): Promise<{ result: PixelImageData }> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        const result = pixelOE.pixelize(imageData)
        resolve(result)
      }
      catch (error) {
        reject(error)
      }
    }, 10)
  })
}

async function downloadResult() {
  if (!resultImage.value) {
    return
  }

  try {
    const blob = await pixelOE.exportBlob(resultImage.value, 'image/png')
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = 'pixeloe-result.png'
    document.body.append(a)
    a.click()
    a.remove()

    URL.revokeObjectURL(url)
  }
  catch (error) {
    console.error('Error downloading image:', error)
    alert('Download failed, please try again')
  }
}

function drawOriginalImage() {
  if (!originalCanvas.value || !originalImage.value) {
    return
  }

  const ctx = originalCanvas.value.getContext('2d')
  if (!ctx) {
    return
  }

  const imageData = originalImage.value.toCanvasImageData()
  ctx.clearRect(0, 0, originalCanvas.value.width, originalCanvas.value.height)
  ctx.putImageData(imageData, 0, 0)
}

function drawResultImage() {
  if (!resultCanvas.value || !resultImage.value) {
    return
  }

  const ctx = resultCanvas.value.getContext('2d')
  if (!ctx) {
    return
  }

  const imageData = resultImage.value.toCanvasImageData()
  ctx.clearRect(0, 0, resultCanvas.value.width, resultCanvas.value.height)
  ctx.imageSmoothingEnabled = false // Disable smoothing for pixel art
  ctx.putImageData(imageData, 0, 0)
}
</script>

<template>
  <div class="h-screen flex flex-col bg-white">
    <!-- Header -->
    <div class="flex-shrink-0 bg-black p-4 text-white">
      <div class="mx-auto max-w-2xl px-4">
        <h1 class="text-xl font-bold">
          PixelOE.js
        </h1>
        <p class="text-sm text-gray-300">
          Pixel Art Generator
        </p>
      </div>
    </div>

    <div class="mx-auto max-w-2xl w-full flex flex-1 flex-col overflow-hidden px-4">
      <!-- Upload Area (only when image is loaded) -->
      <div v-if="originalImage" class="flex-shrink-0 py-4">
        <div class="relative">
          <input
            id="fileInput"
            ref="fileInput"
            type="file"
            accept="image/*"
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            @change="handleFileSelect"
          >
          <div class="border-2 border-gray-300 rounded-2xl border-dashed bg-gray-50 p-4 text-center transition-all hover:border-gray-400 hover:bg-gray-100">
            <div class="flex items-center justify-center text-gray-600">
              <div class="i-carbon-cloud-upload mr-2 h-5 w-5" />
              <p class="font-medium">
                Change Image
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 overflow-hidden" :class="!originalImage ? 'py-4' : 'pb-4'">
        <!-- Before Upload - Upload area takes full space -->
        <div v-if="!originalImage" class="h-full">
          <div class="relative h-full">
            <input
              id="fileInputMain"
              ref="fileInputMain"
              type="file"
              accept="image/*"
              class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              @change="handleFileSelect"
            >
            <div class="h-full flex items-center justify-center border-2 border-gray-300 rounded-2xl border-dashed bg-gray-50 text-center transition-all hover:border-gray-400 hover:bg-gray-100">
              <div class="text-gray-600">
                <div class="i-carbon-cloud-upload mx-auto mb-4 h-16 w-16" />
                <p class="mb-2 text-lg font-semibold">
                  Upload Your Image
                </p>
                <p class="mb-1 text-sm text-gray-500">
                  PNG, JPG, WEBP
                </p>
                <p class="text-xs text-gray-400">
                  or paste image from clipboard
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- After Upload - Overlapped View -->
        <div v-else class="h-full flex flex-col">
          <!-- Image Container with Overlay -->
          <div class="min-h-0 flex flex-1 flex-col">
            <div class="mb-3 text-center">
              <h4 class="text-sm text-gray-700 font-medium">
                {{ showingOriginal ? 'Original' : (resultImage ? 'Pixel Art' : 'Ready') }}
              </h4>
              <p class="mt-1 text-xs text-gray-500">
                {{ resultImage ? 'Hold to view original' : 'Generate to see result' }}
              </p>
            </div>

            <div class="relative flex flex-1 items-center justify-center overflow-hidden border border-gray-200 rounded-xl bg-gray-50">
              <!-- Original Canvas (always present when image loaded) -->
              <canvas
                ref="originalCanvas"
                :width="originalImage?.width || 0"
                :height="originalImage?.height || 0"
                class="h-full w-full rounded object-contain transition-opacity duration-200"
                :class="{ 'opacity-100': showingOriginal || !resultImage, 'opacity-0': !showingOriginal && resultImage }"
              />

              <!-- Result Canvas (overlapped) -->
              <canvas
                v-if="resultImage"
                ref="resultCanvas"
                :width="resultImage.width"
                :height="resultImage.height"
                class="pixel-art absolute inset-0 h-full w-full rounded object-contain transition-opacity duration-200"
                :class="{ 'opacity-0': showingOriginal, 'opacity-100': !showingOriginal }"
                @mousedown="showingOriginal = true"
                @mouseup="showingOriginal = false"
                @mouseleave="showingOriginal = false"
                @touchstart="showingOriginal = true"
                @touchend="showingOriginal = false"
                @touchcancel="showingOriginal = false"
              />

              <!-- Processing State -->
              <div v-if="processing" class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90">
                <div class="text-center text-gray-600">
                  <div class="i-carbon-loading mx-auto mb-2 h-8 w-8 animate-spin" />
                  <p class="text-xs">
                    Processing...
                  </p>
                </div>
              </div>

              <!-- Ready State -->
              <div v-if="!resultImage && !processing" class="absolute inset-0 flex items-center justify-center">
                <div class="text-center text-gray-400">
                  <div class="i-carbon-magic-wand mx-auto mb-2 h-8 w-8" />
                  <p class="text-xs">
                    Ready
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Actions -->
      <div v-if="originalImage" class="flex-shrink-0 border-t border-gray-100 bg-white py-4">
        <div class="flex space-x-3">
          <button
            :disabled="processing"
            class="flex-1 transform rounded-xl bg-black py-3 text-white font-semibold transition-all active:scale-95 disabled:scale-100 disabled:opacity-50"
            @click="processImage"
          >
            <div v-if="processing" class="flex items-center justify-center">
              <div class="i-carbon-loading mr-2 h-4 w-4 animate-spin" />
              Processing
            </div>
            <div v-else class="flex items-center justify-center">
              <div class="i-carbon-magic-wand mr-2 h-4 w-4" />
              Generate
            </div>
          </button>

          <button
            class="rounded-xl bg-gray-100 px-4 text-gray-700 transition-all active:scale-95 hover:bg-gray-200"
            @click="showSettings = true"
          >
            <div class="i-carbon-settings h-5 w-5" />
          </button>

          <button
            v-if="resultImage"
            class="rounded-xl bg-gray-800 px-4 text-white transition-all active:scale-95 hover:bg-gray-900"
            @click="downloadResult"
          >
            <div class="i-carbon-download h-5 w-5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <div v-if="showSettings" class="fixed inset-0 z-50 flex flex-col bg-white">
      <div class="h-full w-full flex flex-col" @click.stop>
        <div class="flex flex-shrink-0 items-center justify-between border-b border-gray-200 p-6">
          <h3 class="text-lg text-gray-900 font-semibold">
            Settings
          </h3>
          <button class="text-gray-400 hover:text-gray-600" @click="showSettings = false">
            <div class="i-carbon-close h-6 w-6" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-6">
          <div class="space-y-6">
            <!-- Processing Mode -->
            <div>
              <label class="mb-3 block text-sm text-gray-700 font-medium">Processing Mode</label>
              <div class="grid grid-cols-1 gap-2">
                <label
                  v-for="mode in simpleModes" :key="mode.value"
                  class="flex cursor-pointer items-center border rounded-lg p-3 transition-all"
                  :class="options.mode === mode.value
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'"
                >
                  <input
                    v-model="options.mode"
                    type="radio"
                    :value="mode.value"
                    class="sr-only"
                    @change="handleOptionsChange"
                  >
                  <div class="flex-1">
                    <div class="font-medium">{{ mode.label }}</div>
                    <div class="text-sm opacity-80">{{ mode.description }}</div>
                  </div>
                  <div v-if="options.mode === mode.value" class="i-carbon-checkmark h-5 w-5" />
                </label>
              </div>
            </div>

            <!-- Sliders -->
            <div class="space-y-4">
              <!-- Pixel Size (Patch Size) -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Pixel Size (Patch)</label>
                  <span class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.pixelSize }}</span>
                </div>
                <input
                  v-model.number="options.pixelSize"
                  type="range"
                  min="2"
                  max="16"
                  step="1"
                  class="range-gray h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                  @input="handleOptionsChange"
                >
              </div>

              <!-- Target Size -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Target Size</label>
                  <span class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.targetSize }}</span>
                </div>
                <input
                  v-model.number="options.targetSize"
                  type="range"
                  min="64"
                  max="512"
                  step="16"
                  class="range-gray h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                  @input="handleOptionsChange"
                >
              </div>

              <!-- Thickness (Outline) -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Thickness (Outline)</label>
                  <span class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.thickness }}</span>
                </div>
                <input
                  v-model.number="options.thickness"
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  class="range-gray h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                  @input="handleOptionsChange"
                >
              </div>

              <!-- Contrast -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Contrast</label>
                  <span class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.contrast.toFixed(1) }}</span>
                </div>
                <input
                  v-model.number="options.contrast"
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  class="range-gray h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                  @input="handleOptionsChange"
                >
              </div>

              <!-- Saturation -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Saturation</label>
                  <span class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.saturation.toFixed(1) }}</span>
                </div>
                <input
                  v-model.number="options.saturation"
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  class="range-gray h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                  @input="handleOptionsChange"
                >
              </div>

              <!-- K-Centroids -->
              <div v-if="options.mode === 'k-centroid'">
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Clusters</label>
                  <span class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.kCentroids }}</span>
                </div>
                <input
                  v-model.number="options.kCentroids"
                  type="range"
                  min="2"
                  max="8"
                  step="1"
                  class="range-gray h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                  @input="handleOptionsChange"
                >
              </div>
            </div>

            <!-- Toggle Options -->
            <div class="border-t border-gray-200 pt-4 space-y-4">
              <!-- Color Matching -->
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm text-gray-700 font-medium">Color Matching</label>
                  <p class="text-xs text-gray-500">
                    Optimize color palette selection
                  </p>
                </div>
                <button
                  class="relative h-6 w-11 inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  :class="options.colorMatching ? 'bg-gray-800' : 'bg-gray-200'"
                  @click="options.colorMatching = !options.colorMatching; handleOptionsChange()"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    :class="options.colorMatching ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </div>

              <!-- No Upscale -->
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm text-gray-700 font-medium">No Upscale</label>
                  <p class="text-xs text-gray-500">
                    Prevent image upscaling
                  </p>
                </div>
                <button
                  class="relative h-6 w-11 inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  :class="options.noUpscale ? 'bg-gray-800' : 'bg-gray-200'"
                  @click="options.noUpscale = !options.noUpscale; handleOptionsChange()"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    :class="options.noUpscale ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </div>

              <!-- No Downscale -->
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm text-gray-700 font-medium">No Downscale</label>
                  <p class="text-xs text-gray-500">
                    Prevent image downscaling
                  </p>
                </div>
                <button
                  class="relative h-6 w-11 inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  :class="options.noDownscale ? 'bg-gray-800' : 'bg-gray-200'"
                  @click="options.noDownscale = !options.noDownscale; handleOptionsChange()"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    :class="options.noDownscale ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom range slider styles */
.range-blue::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
}

.range-purple::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(139, 92, 246, 0.3);
}

.range-green::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
}

.range-orange::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ea580c);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(249, 115, 22, 0.3);
}

.range-pink::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ec4899, #db2777);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(236, 72, 153, 0.3);
}

.range-gray::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #374151, #1f2937);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(55, 65, 81, 0.3);
}

/* Firefox */
.range-blue::-moz-range-thumb,
.range-purple::-moz-range-thumb,
.range-green::-moz-range-thumb,
.range-orange::-moz-range-thumb,
.range-pink::-moz-range-thumb,
.range-gray::-moz-range-thumb {
  height: 20px;
  width: 20px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid white;
}

.range-blue::-moz-range-thumb {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
}

.range-purple::-moz-range-thumb {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
}

.range-green::-moz-range-thumb {
  background: linear-gradient(135deg, #10b981, #059669);
}

.range-orange::-moz-range-thumb {
  background: linear-gradient(135deg, #f97316, #ea580c);
}

.range-pink::-moz-range-thumb {
  background: linear-gradient(135deg, #ec4899, #db2777);
}

.range-gray::-moz-range-thumb {
  background: linear-gradient(135deg, #374151, #1f2937);
}

/* Pixel art canvas style */
.pixel-art {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

/* Touch-friendly hover states */
@media (hover: hover) {
  .hover\:bg-gray-50:hover {
    background-color: #f9fafb;
  }

  .hover\:bg-gray-100:hover {
    background-color: #f3f4f6;
  }
}
</style>
