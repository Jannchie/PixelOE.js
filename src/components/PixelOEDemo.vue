<template>
  <div class="h-screen bg-white flex flex-col">
    <!-- Header -->
    <div class="bg-black text-white p-4 flex-shrink-0">
      <div class="max-w-2xl mx-auto px-4">
        <h1 class="text-xl font-bold">PixelOE.js</h1>
        <p class="text-gray-300 text-sm">Pixel Art Generator</p>
      </div>
    </div>

    <div class="max-w-2xl mx-auto w-full flex-1 flex flex-col overflow-hidden px-4">
      
      <!-- Upload Area (only when image is loaded) -->
      <div v-if="originalImage" class="py-4 flex-shrink-0">
        <div class="relative">
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            @change="handleFileSelect"
            id="fileInput"
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div class="border-2 border-dashed border-gray-300 rounded-2xl p-4 text-center bg-gray-50 hover:border-gray-400 hover:bg-gray-100 transition-all">
            <div class="text-gray-600 flex items-center justify-center">
              <div class="w-5 h-5 mr-2 i-carbon-cloud-upload"></div>
              <p class="font-medium">Change Image</p>
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
              ref="fileInputMain"
              type="file"
              accept="image/*"
              @change="handleFileSelect"
              id="fileInputMain"
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div class="h-full border-2 border-dashed border-gray-300 rounded-2xl text-center bg-gray-50 hover:border-gray-400 hover:bg-gray-100 transition-all flex items-center justify-center">
              <div class="text-gray-600">
                <div class="w-16 h-16 mx-auto mb-4 i-carbon-cloud-upload"></div>
                <p class="font-semibold text-lg mb-2">Upload Your Image</p>
                <p class="text-sm text-gray-500 mb-1">PNG, JPG, WEBP</p>
                <p class="text-xs text-gray-400">or paste image from clipboard</p>
              </div>
            </div>
          </div>
        </div>

        <!-- After Upload - Overlapped View -->
        <div v-else class="h-full flex flex-col">
          <!-- Image Container with Overlay -->
          <div class="flex-1 flex flex-col min-h-0">
            <div class="text-center mb-3">
              <h4 class="text-sm font-medium text-gray-700">
                {{ showingOriginal ? 'Original' : (resultImage ? 'Pixel Art' : 'Ready') }}
              </h4>
              <p class="text-xs text-gray-500 mt-1">
                {{ resultImage ? 'Hold to view original' : 'Generate to see result' }}
              </p>
            </div>
            
            <div class="flex-1 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200 relative overflow-hidden">
              <!-- Original Canvas (always present when image loaded) -->
              <canvas
                ref="originalCanvas"
                :width="originalImage?.width || 0"
                :height="originalImage?.height || 0"
                class="w-full h-full object-contain rounded transition-opacity duration-200"
                :class="{ 'opacity-100': showingOriginal || !resultImage, 'opacity-0': !showingOriginal && resultImage }"
              ></canvas>
              
              <!-- Result Canvas (overlapped) -->
              <canvas
                v-if="resultImage"
                ref="resultCanvas"
                :width="resultImage.width"
                :height="resultImage.height"
                class="w-full h-full object-contain rounded pixel-art absolute inset-0 transition-opacity duration-200"
                :class="{ 'opacity-0': showingOriginal, 'opacity-100': !showingOriginal }"
                @mousedown="showingOriginal = true"
                @mouseup="showingOriginal = false"
                @mouseleave="showingOriginal = false"
                @touchstart="showingOriginal = true"
                @touchend="showingOriginal = false"
                @touchcancel="showingOriginal = false"
              ></canvas>
              
              <!-- Processing State -->
              <div v-if="processing" class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90">
                <div class="text-center text-gray-600">
                  <div class="w-8 h-8 mx-auto mb-2 animate-spin i-carbon-loading"></div>
                  <p class="text-xs">Processing...</p>
                </div>
              </div>
              
              <!-- Ready State -->
              <div v-if="!resultImage && !processing" class="absolute inset-0 flex items-center justify-center">
                <div class="text-center text-gray-400">
                  <div class="w-8 h-8 mx-auto mb-2 i-carbon-magic-wand"></div>
                  <p class="text-xs">Ready</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Actions -->
      <div v-if="originalImage" class="py-4 bg-white border-t border-gray-100 flex-shrink-0">
        <div class="flex space-x-3">
          <button 
            @click="processImage" 
            :disabled="processing" 
            class="flex-1 bg-black text-white font-semibold py-3 rounded-xl transition-all transform active:scale-95 disabled:opacity-50 disabled:scale-100"
          >
            <div v-if="processing" class="flex items-center justify-center">
              <div class="animate-spin w-4 h-4 mr-2 i-carbon-loading"></div>
              Processing
            </div>
            <div v-else class="flex items-center justify-center">
              <div class="w-4 h-4 mr-2 i-carbon-magic-wand"></div>
              Generate
            </div>
          </button>
          
          <button 
            @click="showSettings = true"
            class="px-4 bg-gray-100 text-gray-700 rounded-xl transition-all hover:bg-gray-200 active:scale-95"
          >
            <div class="w-5 h-5 i-carbon-settings"></div>
          </button>
          
          <button 
            v-if="resultImage"
            @click="downloadResult"
            class="px-4 bg-gray-800 text-white rounded-xl transition-all hover:bg-gray-900 active:scale-95"
          >
            <div class="w-5 h-5 i-carbon-download"></div>
          </button>
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <div v-if="showSettings" class="fixed inset-0 bg-white z-50 flex flex-col">
      <div class="w-full h-full flex flex-col" @click.stop>
        <div class="flex justify-between items-center p-6 border-b border-gray-200 flex-shrink-0">
          <h3 class="text-lg font-semibold text-gray-900">Settings</h3>
          <button @click="showSettings = false" class="text-gray-400 hover:text-gray-600">
            <div class="w-6 h-6 i-carbon-close"></div>
          </button>
        </div>
        
        <div class="flex-1 overflow-y-auto p-6">
          <div class="space-y-6">
          <!-- Processing Mode -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-3">Processing Mode</label>
            <div class="grid grid-cols-1 gap-2">
              <label v-for="mode in simpleModes" :key="mode.value" 
                class="flex items-center p-3 rounded-lg cursor-pointer transition-all border"
                :class="options.mode === mode.value ? 
                  'bg-black text-white border-black' : 
                  'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'"
              >
                <input 
                  type="radio" 
                  :value="mode.value" 
                  v-model="options.mode" 
                  @change="handleOptionsChange"
                  class="sr-only"
                />
                <div class="flex-1">
                  <div class="font-medium">{{ mode.label }}</div>
                  <div class="text-sm opacity-80">{{ mode.description }}</div>
                </div>
                <div v-if="options.mode === mode.value" class="w-5 h-5 i-carbon-checkmark"></div>
              </label>
            </div>
          </div>
          
          <!-- Sliders -->
          <div class="space-y-4">
            <!-- Pixel Size -->
            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="text-sm font-medium text-gray-700">Pixel Size</label>
                <span class="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded font-medium">{{ options.pixelSize }}</span>
              </div>
              <input
                type="range"
                v-model.number="options.pixelSize"
                min="2"
                max="16"
                step="1"
                @input="handleOptionsChange"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-gray"
              />
            </div>

            <!-- Outline -->
            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="text-sm font-medium text-gray-700">Outline</label>
                <span class="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded font-medium">{{ options.thickness }}</span>
              </div>
              <input
                type="range"
                v-model.number="options.thickness"
                min="0"
                max="5"
                step="1"
                @input="handleOptionsChange"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-gray"
              />
            </div>

            <!-- Contrast -->
            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="text-sm font-medium text-gray-700">Contrast</label>
                <span class="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded font-medium">{{ options.contrast.toFixed(1) }}</span>
              </div>
              <input
                type="range"
                v-model.number="options.contrast"
                min="0.5"
                max="2.0"
                step="0.1"
                @input="handleOptionsChange"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-gray"
              />
            </div>

            <!-- Saturation -->
            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="text-sm font-medium text-gray-700">Saturation</label>
                <span class="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded font-medium">{{ options.saturation.toFixed(1) }}</span>
              </div>
              <input
                type="range"
                v-model.number="options.saturation"
                min="0.5"
                max="2.0"
                step="0.1"
                @input="handleOptionsChange"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-gray"
              />
            </div>

            <!-- K-Centroids -->
            <div v-if="options.mode === 'k-centroid'">
              <div class="flex justify-between items-center mb-2">
                <label class="text-sm font-medium text-gray-700">Clusters</label>
                <span class="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded font-medium">{{ options.kCentroids }}</span>
              </div>
              <input
                type="range"
                v-model.number="options.kCentroids"
                min="2"
                max="8"
                step="1"
                @input="handleOptionsChange"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-gray"
              />
            </div>
          </div>

          <!-- Toggle Options -->
          <div class="space-y-4 pt-4 border-t border-gray-200">
            <!-- Color Matching -->
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium text-gray-700">Color Matching</label>
                <p class="text-xs text-gray-500">Optimize color palette selection</p>
              </div>
              <button
                @click="options.colorMatching = !options.colorMatching; handleOptionsChange()"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                :class="options.colorMatching ? 'bg-gray-800' : 'bg-gray-200'"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="options.colorMatching ? 'translate-x-6' : 'translate-x-1'"
                ></span>
              </button>
            </div>

            <!-- No Upscale -->
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium text-gray-700">No Upscale</label>
                <p class="text-xs text-gray-500">Prevent image upscaling</p>
              </div>
              <button
                @click="options.noUpscale = !options.noUpscale; handleOptionsChange()"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                :class="options.noUpscale ? 'bg-gray-800' : 'bg-gray-200'"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="options.noUpscale ? 'translate-x-6' : 'translate-x-1'"
                ></span>
              </button>
            </div>

            <!-- No Downscale -->
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium text-gray-700">No Downscale</label>
                <p class="text-xs text-gray-500">Prevent image downscaling</p>
              </div>
              <button
                @click="options.noDownscale = !options.noDownscale; handleOptionsChange()"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                :class="options.noDownscale ? 'bg-gray-800' : 'bg-gray-200'"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="options.noDownscale ? 'translate-x-6' : 'translate-x-1'"
                ></span>
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import { PixelOE, PixelImageData, type PixelOEOptions } from '../index'

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
  pixelSize: 8,  // 更大的默认像素大小
  thickness: 2,  // 适中的轮廓
  mode: 'contrast',  // 最佳质量模式
  colorMatching: true,
  contrast: 1.2,  // 稍微增强对比度
  saturation: 1.1,  // 稍微增强饱和度
  noUpscale: false,
  noDownscale: false,
  kCentroids: 3  // 更好的聚类效果
})

// Simplified mode options
const simpleModes = [
  {
    value: 'contrast',
    label: 'Smart',
    description: 'AI-powered intelligent selection'
  },
  {
    value: 'center',
    label: 'Center',
    description: 'Simple center-based sampling'
  },
  {
    value: 'k-centroid',
    label: 'Cluster',
    description: 'Color clustering algorithm'
  },
  {
    value: 'nearest',
    label: 'Fast',
    description: 'Quick nearest neighbor'
  },
  {
    value: 'bilinear',
    label: 'Smooth',
    description: 'Smooth interpolation'
  }
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
    if (!items) return
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
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
  
  if (!file) return
  
  try {
    originalImage.value = await pixelOE.loadImage(file)
    await nextTick()
    drawOriginalImage()
    resultImage.value = null // Clear previous result
  } catch (error) {
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
  } catch (error) {
    console.error('Error loading pasted image:', error)
    alert('Failed to load pasted image, please try again')
  }
}

function handleOptionsChange() {
  pixelOE.setOptions(options)
}

async function processImage() {
  if (!originalImage.value) return
  
  processing.value = true
  
  try {
    // Use setTimeout to allow UI to update
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Process in chunks to avoid blocking UI
    const result = await processImageAsync(originalImage.value)
    resultImage.value = result.result
    
    await nextTick()
    drawResultImage()
  } catch (error) {
    console.error('Error processing image:', error)
    alert('Processing failed: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
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
      } catch (error) {
        reject(error)
      }
    }, 10)
  })
}

async function downloadResult() {
  if (!resultImage.value) return
  
  try {
    const blob = await pixelOE.exportBlob(resultImage.value, 'image/png')
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = 'pixeloe-result.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error downloading image:', error)
    alert('Download failed, please try again')
  }
}

function drawOriginalImage() {
  if (!originalCanvas.value || !originalImage.value) return
  
  const ctx = originalCanvas.value.getContext('2d')
  if (!ctx) return
  
  const imageData = originalImage.value.toCanvasImageData()
  ctx.clearRect(0, 0, originalCanvas.value.width, originalCanvas.value.height)
  ctx.putImageData(imageData, 0, 0)
}

function drawResultImage() {
  if (!resultCanvas.value || !resultImage.value) return
  
  const ctx = resultCanvas.value.getContext('2d')
  if (!ctx) return
  
  const imageData = resultImage.value.toCanvasImageData()
  ctx.clearRect(0, 0, resultCanvas.value.width, resultCanvas.value.height)
  ctx.imageSmoothingEnabled = false // Disable smoothing for pixel art
  ctx.putImageData(imageData, 0, 0)
}
</script>

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