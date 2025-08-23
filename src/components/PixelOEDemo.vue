<script setup lang="ts">
import type { PixelImageData, PixelOEOptions } from '../index'
import type { ColorPalette } from '../core/palettes'
import Button from 'primevue/button'
import FileUpload from 'primevue/fileupload'
import InputSwitch from 'primevue/inputswitch'
import ProgressSpinner from 'primevue/progressspinner'
import Slider from 'primevue/slider'
import Dropdown from 'primevue/dropdown'
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { PixelOE } from '../index'
import PaletteSelector from './PaletteSelector.vue'

// Reactive state
const fileInput = ref<HTMLInputElement>()
const originalCanvas = ref<HTMLCanvasElement>()
const resultCanvas = ref<HTMLCanvasElement>()

const originalImage = ref<PixelImageData | null>(null)
const resultImage = ref<PixelImageData | null>(null)
const processing = ref(false)
const showSettings = ref(false)
const showingOriginal = ref(false)
const processingTime = ref<number>(0)
const lastEdgeCoverage = ref<number>(0)

const options = reactive<PixelOEOptions>({
  pixelSize: 8,
  thickness: 2,
  targetSize: 256,
  mode: 'contrast',
  colorMatching: true,
  contrast: 1,
  saturation: 1,
  noUpscale: false,
  noDownscale: false,
  kCentroids: 3,
  
  // Palette options
  usePalette: false,
  selectedPalette: undefined as ColorPalette | undefined,
  ditherMethod: 'none' as 'none' | 'ordered' | 'error_diffusion',
  
  // Advanced edge expansion options
  edgeExpansionMode: 'optimized' as 'legacy' | 'optimized',
  edgeDetectionThreshold: 0.1,
  useEdgeOptimization: true,
  adaptiveProcessing: true,
})

// Dropdown options
const edgeExpansionModes = [
  { label: 'Legacy (Original)', value: 'legacy', description: 'Original algorithm, highest quality but slower' },
  { label: 'Optimized (Recommended)', value: 'optimized', description: 'Edge-aware processing, balanced speed and quality' }
]

const processingModes = [
  { label: 'Contrast', value: 'contrast' },
  { label: 'Center', value: 'center' },
  { label: 'Nearest', value: 'nearest' },
  { label: 'Bilinear', value: 'bilinear' },
  { label: 'K-Centroid', value: 'k-centroid' }
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
    if (!items)
      return

    for (const item of Array.from(items)) {
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
async function handleFileSelect(event: any) {
  const files = event.files
  if (!files || files.length === 0)
    return

  try {
    originalImage.value = await pixelOE.loadImage(files[0])
    await nextTick()
    drawOriginalImage()
    resultImage.value = null
  }
  catch (error) {
    console.error('Error loading image:', error)
  }
}

async function handlePastedImage(file: File) {
  try {
    originalImage.value = await pixelOE.loadImage(file)
    await nextTick()
    drawOriginalImage()
    resultImage.value = null
  }
  catch (error) {
    console.error('Error loading pasted image:', error)
  }
}

// Handle file input change
function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    handlePastedImage(input.files[0])
  }
}

// Drag and drop handlers
function onDragOver(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function onDragLeave(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()

  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    const file = files[0]
    if (file.type.startsWith('image/')) {
      handlePastedImage(file)
    }
  }
}

function handleOptionsChange() {
  pixelOE.setOptions(options)
}

async function processImage() {
  if (!originalImage.value)
    return

  processing.value = true
  const startTime = performance.now()

  try {
    await new Promise(resolve => setTimeout(resolve, 100))
    const result = await processImageAsync(originalImage.value)
    resultImage.value = result.result
    
    const endTime = performance.now()
    processingTime.value = endTime - startTime

    await nextTick()
    drawResultImage()
  }
  catch (error) {
    console.error('Error processing image:', error)
  }
  finally {
    processing.value = false
  }
}

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
  if (!resultImage.value)
    return

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
  }
}

function drawOriginalImage() {
  if (!originalCanvas.value || !originalImage.value)
    return

  const ctx = originalCanvas.value.getContext('2d')
  if (!ctx)
    return

  const imageData = originalImage.value.toCanvasImageData()
  ctx.clearRect(0, 0, originalCanvas.value.width, originalCanvas.value.height)
  ctx.putImageData(imageData, 0, 0)
}

function drawResultImage() {
  if (!resultCanvas.value || !resultImage.value)
    return

  const ctx = resultCanvas.value.getContext('2d')
  if (!ctx)
    return

  const imageData = resultImage.value.toCanvasImageData()
  ctx.clearRect(0, 0, resultCanvas.value.width, resultCanvas.value.height)
  ctx.imageSmoothingEnabled = false
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
          <FileUpload
            mode="basic"
            accept="image/*"
            :max-file-size="10000000"
            auto
            choose-label="Change Image"
            class="w-full"
            @upload="handleFileSelect"
            @select="handleFileSelect"
          />
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 overflow-hidden" :class="!originalImage ? 'py-4' : 'pb-4'">
        <!-- Before Upload - Upload area takes full space -->
        <div v-if="!originalImage" class="h-full">
          <div class="relative h-full">
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              @change="handleFileInputChange"
            >
            <div
              class="h-full flex cursor-pointer items-center justify-center border-2 border-gray-300 border-dashed bg-gray-50 text-center transition-all hover:border-gray-400 hover:bg-gray-100"
              @dragover.prevent="onDragOver"
              @dragleave.prevent="onDragLeave"
              @drop.prevent="onDrop"
            >
              <div class="text-gray-600">
                <div class="i-carbon-cloud-upload mx-auto mb-4 h-16 w-16" />
                <p class="mb-2 text-lg font-semibold">
                  Upload Your Image
                </p>
                <p class="mb-1 text-sm text-gray-500">
                  PNG, JPG, WEBP
                </p>
                <p class="text-xs text-gray-400">
                  Or paste image from clipboard
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
              <div class="mt-1 space-y-1">
                <p class="text-xs text-gray-500">
                  {{ resultImage ? 'Hold to view original comparison' : 'Click Generate to see effect' }}
                </p>
                <div v-if="resultImage && processingTime > 0" class="flex items-center justify-center gap-4 text-xs text-gray-400">
                  <span>⏱️ {{ processingTime.toFixed(0) }}ms</span>
                  <span v-if="options.edgeExpansionMode === 'optimized'">
                    ⚡ Optimized
                  </span>
                  <span v-if="lastEdgeCoverage > 0">
                    🎯 {{ (lastEdgeCoverage * 100).toFixed(0) }}% edges
                  </span>
                </div>
              </div>
            </div>

            <div class="relative flex flex-1 items-center justify-center overflow-hidden border border-gray-200 bg-gray-50">
              <!-- Original Canvas (always present when image loaded) -->
              <canvas
                ref="originalCanvas"
                :width="originalImage?.width || 0"
                :height="originalImage?.height || 0"
                class="h-full w-full object-contain transition-opacity duration-200"
                :class="{ 'opacity-100': showingOriginal || !resultImage, 'opacity-0': !showingOriginal && resultImage }"
              />

              <!-- Result Canvas (overlapped) -->
              <canvas
                v-if="resultImage"
                ref="resultCanvas"
                :width="resultImage.width"
                :height="resultImage.height"
                class="pixel-art absolute inset-0 h-full w-full object-contain transition-opacity duration-200"
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
                  <ProgressSpinner style="width: 32px; height: 32px" stroke-width="4" class="mb-2" />
                  <p class="text-xs">
                    Processing...
                  </p>
                  <p class="mt-1 text-xs text-gray-400">
                    Using {{ options.edgeExpansionMode === 'legacy' ? 'Legacy' : 'Optimized' }} algorithm
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
          <Button
            :disabled="processing"
            :loading="processing"
            label="Generate"
            class="flex-1"
            @click="processImage"
          />

          <Button
            @click="showSettings = true"
          >
            <div class="i-carbon-settings h-5 w-5" />
          </Button>

          <Button
            v-if="resultImage"
            @click="downloadResult"
          >
            <div class="i-carbon-download h-5 w-5" />
          </Button>
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
          <Button
            text
            severity="secondary"
            @click="showSettings = false"
          >
            <div class="i-carbon-close h-6 w-6" />
          </Button>
        </div>

        <div class="flex-1 overflow-y-auto p-6">
          <div class="space-y-6">
            <!-- Sliders -->
            <div class="space-y-4">
              <!-- Pixel Size -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Pixel Size</label>
                  <span class="bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.pixelSize }}</span>
                </div>
                <Slider
                  v-model="options.pixelSize"
                  :min="2"
                  :max="16"
                  :step="1"
                  class="w-full"
                  @update:model-value="handleOptionsChange"
                />
              </div>

              <!-- Target Size -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Target Size</label>
                  <span class="bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.targetSize }}</span>
                </div>
                <Slider
                  v-model="options.targetSize"
                  :min="64"
                  :max="512"
                  :step="16"
                  class="w-full"
                  @update:model-value="handleOptionsChange"
                />
              </div>

              <!-- Thickness -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Outline Thickness</label>
                  <span class="bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.thickness }}</span>
                </div>
                <Slider
                  v-model="options.thickness"
                  :min="0"
                  :max="10"
                  :step="1"
                  class="w-full"
                  @update:model-value="handleOptionsChange"
                />
              </div>

              <!-- Contrast -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Contrast</label>
                  <span class="bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.contrast.toFixed(1) }}</span>
                </div>
                <Slider
                  v-model="options.contrast"
                  :min="0.5"
                  :max="2.0"
                  :step="0.1"
                  class="w-full"
                  @update:model-value="handleOptionsChange"
                />
              </div>

              <!-- Saturation -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm text-gray-700 font-medium">Saturation</label>
                  <span class="bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ options.saturation.toFixed(1) }}</span>
                </div>
                <Slider
                  v-model="options.saturation"
                  :min="0.5"
                  :max="2.0"
                  :step="0.1"
                  class="w-full"
                  @update:model-value="handleOptionsChange"
                />
              </div>
            </div>

            <!-- Algorithm Performance Section -->
            <div class="border-t border-gray-200 pt-4">
              <h4 class="mb-4 text-sm text-gray-700 font-semibold">Algorithm Performance</h4>
              <div class="space-y-4">
                <!-- Processing Mode -->
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <label class="text-sm text-gray-700 font-medium">Processing Mode</label>
                  </div>
                  <Dropdown
                    v-model="options.mode"
                    :options="processingModes"
                    option-label="label"
                    option-value="value"
                    placeholder="Select processing mode"
                    class="w-full"
                    @update:model-value="handleOptionsChange"
                  />
                </div>

                <!-- Edge Expansion Algorithm -->
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <label class="text-sm text-gray-700 font-medium">Edge Expansion Algorithm</label>
                  </div>
                  <Dropdown
                    v-model="options.edgeExpansionMode"
                    :options="edgeExpansionModes"
                    option-label="label"
                    option-value="value"
                    placeholder="Select edge expansion algorithm"
                    class="w-full"
                    @update:model-value="handleOptionsChange"
                  >
                    <template #option="slotProps">
                      <div class="py-2">
                        <div class="font-medium">{{ slotProps.option.label }}</div>
                        <div class="text-xs text-gray-500 mt-1">{{ slotProps.option.description }}</div>
                      </div>
                    </template>
                  </Dropdown>
                  <p class="mt-2 text-xs text-gray-500">
                    <span v-if="options.edgeExpansionMode === 'legacy'">
                      🐌 Original algorithm with full quality but slower processing
                    </span>
                    <span v-else-if="options.edgeExpansionMode === 'optimized'">
                      ⚡ Best balance of speed and quality with edge-aware optimization
                    </span>
                  </p>
                </div>

                <!-- Advanced Options for Optimized Mode -->
                <div v-if="options.edgeExpansionMode === 'optimized'" class="space-y-3">
                  <!-- Edge Detection Threshold -->
                  <div>
                    <div class="mb-2 flex items-center justify-between">
                      <label class="text-sm text-gray-700 font-medium">Edge Sensitivity</label>
                      <span class="bg-gray-100 px-2 py-1 text-sm text-gray-600 font-medium">{{ ((options.edgeDetectionThreshold || 0.1) * 100).toFixed(0) }}%</span>
                    </div>
                    <Slider
                      v-model="options.edgeDetectionThreshold"
                      :min="0.01"
                      :max="0.3"
                      :step="0.01"
                      class="w-full"
                      @update:model-value="handleOptionsChange"
                    />
                    <p class="mt-1 text-xs text-gray-500">
                      Lower values detect more edges (slower), higher values detect fewer edges (faster)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Palette Section -->
            <div class="border-t border-gray-200 pt-4">
              <h4 class="mb-4 text-sm text-gray-700 font-semibold">Color Palette</h4>
              <PaletteSelector
                v-model:use-palette="options.usePalette"
                v-model:selected-palette="options.selectedPalette"
                v-model:dither-method="options.ditherMethod"
                @update:use-palette="handleOptionsChange"
                @update:selected-palette="handleOptionsChange"
                @update:dither-method="handleOptionsChange"
              />
            </div>

            <!-- Toggle Options -->
            <div class="border-t border-gray-200 pt-4 space-y-4">
              <!-- Color Matching -->
              <div class="flex items-center justify-between">
                <div>
                  <label class="block text-sm text-gray-700 font-medium">Color Matching</label>
                  <p class="mt-1 text-xs text-gray-500">
                    Optimize color palette selection
                  </p>
                </div>
                <InputSwitch
                  v-model="options.colorMatching"
                  @update:model-value="handleOptionsChange"
                />
              </div>

              <!-- No Upscale -->
              <div class="flex items-center justify-between">
                <div>
                  <label class="block text-sm text-gray-700 font-medium">Disable Upscale</label>
                  <p class="mt-1 text-xs text-gray-500">
                    Prevent image upscaling
                  </p>
                </div>
                <InputSwitch
                  v-model="options.noUpscale"
                  @update:model-value="handleOptionsChange"
                />
              </div>

              <!-- No Downscale -->
              <div class="flex items-center justify-between">
                <div>
                  <label class="block text-sm text-gray-700 font-medium">Disable Downscale</label>
                  <p class="mt-1 text-xs text-gray-500">
                    Prevent image downscaling
                  </p>
                </div>
                <InputSwitch
                  v-model="options.noDownscale"
                  @update:model-value="handleOptionsChange"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pixel-art {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

.bg-checkered {
  background-image:
    linear-gradient(45deg, #f8f9fa 25%, transparent 25%),
    linear-gradient(-45deg, #f8f9fa 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #f8f9fa 75%),
    linear-gradient(-45deg, transparent 75%, #f8f9fa 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}
</style>
