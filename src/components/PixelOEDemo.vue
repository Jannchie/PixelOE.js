<template>
  <div class="pixeloe-demo">
    <div class="controls-panel">
      <div class="control-group">
        <h3>图像输入</h3>
        <div class="file-input-container">
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            @change="handleFileSelect"
            id="fileInput"
          />
          <label for="fileInput" class="file-input-label">
            <span v-if="!originalImage">选择图像文件</span>
            <span v-else>更换图像</span>
          </label>
        </div>
      </div>

      <div class="control-group" v-if="originalImage">
        <h3>处理参数</h3>
        
        <div class="control-item">
          <label>像素大小: {{ options.pixelSize }}</label>
          <input
            type="range"
            v-model.number="options.pixelSize"
            min="2"
            max="16"
            step="1"
            @input="handleOptionsChange"
          />
        </div>

        <div class="control-item">
          <label>轮廓厚度: {{ options.thickness }}</label>
          <input
            type="range"
            v-model.number="options.thickness"
            min="0"
            max="5"
            step="1"
            @input="handleOptionsChange"
          />
        </div>

        <div class="control-item">
          <label>下采样模式:</label>
          <select v-model="options.mode" @change="handleOptionsChange">
            <option value="contrast">对比度感知</option>
            <option value="center">中心像素</option>
            <option value="nearest">最近邻</option>
            <option value="bilinear">双线性</option>
            <option value="k-centroid">K重心聚类</option>
          </select>
        </div>

        <div class="control-item" v-if="options.mode === 'k-centroid'">
          <label>聚类数量: {{ options.kCentroids }}</label>
          <input
            type="range"
            v-model.number="options.kCentroids"
            min="2"
            max="8"
            step="1"
            @input="handleOptionsChange"
          />
        </div>

        <div class="control-item">
          <label>对比度: {{ options.contrast.toFixed(1) }}</label>
          <input
            type="range"
            v-model.number="options.contrast"
            min="0.5"
            max="2.0"
            step="0.1"
            @input="handleOptionsChange"
          />
        </div>

        <div class="control-item">
          <label>饱和度: {{ options.saturation.toFixed(1) }}</label>
          <input
            type="range"
            v-model.number="options.saturation"
            min="0.5"
            max="2.0"
            step="0.1"
            @input="handleOptionsChange"
          />
        </div>

        <div class="control-item">
          <label class="checkbox-label">
            <input
              type="checkbox"
              v-model="options.colorMatching"
              @change="handleOptionsChange"
            />
            启用颜色匹配
          </label>
        </div>

        <div class="control-buttons">
          <button @click="processImage" :disabled="processing" class="process-btn">
            {{ processing ? '处理中...' : '开始处理' }}
          </button>
          
          <button
            v-if="resultImage"
            @click="downloadResult"
            class="download-btn"
          >
            下载结果
          </button>
        </div>
      </div>
    </div>

    <div class="images-panel">
      <div class="image-container" v-if="originalImage">
        <h3>原始图像</h3>
        <canvas
          ref="originalCanvas"
          :width="canvasSize.width"
          :height="canvasSize.height"
        ></canvas>
        <div class="image-info">
          尺寸: {{ originalImage.width }} x {{ originalImage.height }}
        </div>
      </div>

      <div class="image-container" v-if="resultImage">
        <h3>处理结果</h3>
        <canvas
          ref="resultCanvas"
          :width="resultCanvasSize.width"
          :height="resultCanvasSize.height"
        ></canvas>
        <div class="image-info">
          尺寸: {{ resultImage.width }} x {{ resultImage.height }}
        </div>
      </div>

      <div class="processing-info" v-if="processing">
        <div class="spinner"></div>
        <p>正在处理图像...</p>
        <p class="processing-tip">大图像可能需要较长时间，请耐心等待</p>
      </div>

      <div class="info-panel" v-if="!originalImage && !processing">
        <div class="info-content">
          <h3>使用说明</h3>
          <ul>
            <li>选择一张图片开始像素化处理</li>
            <li>调整参数来获得不同的效果</li>
            <li>大图像会自动缩放以提高处理速度</li>
            <li>处理完成后可以下载结果</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { PixelOE, PixelImageData, type PixelOEOptions } from '../index'

// Reactive state
const fileInput = ref<HTMLInputElement>()
const originalCanvas = ref<HTMLCanvasElement>()
const resultCanvas = ref<HTMLCanvasElement>()

const originalImage = ref<PixelImageData | null>(null)
const resultImage = ref<PixelImageData | null>(null)
const processing = ref(false)

const options = reactive<PixelOEOptions>({
  pixelSize: 6,
  thickness: 3,
  mode: 'contrast',
  colorMatching: true,
  contrast: 1.0,
  saturation: 1.0,
  noUpscale: false,
  noDownscale: false,
  kCentroids: 2
})

// Create PixelOE instance
let pixelOE: PixelOE

onMounted(() => {
  pixelOE = new PixelOE(options)
})

// Computed properties for canvas sizes
const canvasSize = computed(() => {
  if (!originalImage.value) return { width: 0, height: 0 }
  
  const maxSize = 400
  const ratio = originalImage.value.width / originalImage.value.height
  
  if (ratio > 1) {
    return {
      width: Math.min(maxSize, originalImage.value.width),
      height: Math.min(maxSize, originalImage.value.width) / ratio
    }
  } else {
    return {
      width: Math.min(maxSize, originalImage.value.height) * ratio,
      height: Math.min(maxSize, originalImage.value.height)
    }
  }
})

const resultCanvasSize = computed(() => {
  if (!resultImage.value) return { width: 0, height: 0 }
  
  const maxSize = 400
  const ratio = resultImage.value.width / resultImage.value.height
  
  if (ratio > 1) {
    return {
      width: Math.min(maxSize, resultImage.value.width),
      height: Math.min(maxSize, resultImage.value.width) / ratio
    }
  } else {
    return {
      width: Math.min(maxSize, resultImage.value.height) * ratio,
      height: Math.min(maxSize, resultImage.value.height)
    }
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
    alert('加载图像失败，请重试')
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
    alert('处理图像失败：' + error.message)
  } finally {
    processing.value = false
  }
}

// Async wrapper to prevent UI blocking
async function processImageAsync(imageData: PixelImageData) {
  return new Promise((resolve, reject) => {
    // Break into smaller chunks using requestIdleCallback or setTimeout
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
    alert('下载失败，请重试')
  }
}

function drawOriginalImage() {
  if (!originalCanvas.value || !originalImage.value) return
  
  const ctx = originalCanvas.value.getContext('2d')
  if (!ctx) return
  
  const imageData = originalImage.value.toCanvasImageData()
  
  // Scale image to fit canvas
  const scaleX = canvasSize.value.width / originalImage.value.width
  const scaleY = canvasSize.value.height / originalImage.value.height
  
  // Create temporary canvas for scaling
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = originalImage.value.width
  tempCanvas.height = originalImage.value.height
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) return
  
  tempCtx.putImageData(imageData, 0, 0)
  
  ctx.clearRect(0, 0, originalCanvas.value.width, originalCanvas.value.height)
  ctx.scale(scaleX, scaleY)
  ctx.drawImage(tempCanvas, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
}

function drawResultImage() {
  if (!resultCanvas.value || !resultImage.value) return
  
  const ctx = resultCanvas.value.getContext('2d')
  if (!ctx) return
  
  const imageData = resultImage.value.toCanvasImageData()
  
  // Scale image to fit canvas
  const scaleX = resultCanvasSize.value.width / resultImage.value.width
  const scaleY = resultCanvasSize.value.height / resultImage.value.height
  
  // Create temporary canvas for scaling
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = resultImage.value.width
  tempCanvas.height = resultImage.value.height
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) return
  
  tempCtx.putImageData(imageData, 0, 0)
  
  ctx.clearRect(0, 0, resultCanvas.value.width, resultCanvas.value.height)
  ctx.imageSmoothingEnabled = false // Disable smoothing for pixel art
  ctx.scale(scaleX, scaleY)
  ctx.drawImage(tempCanvas, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
}
</script>

<style scoped>
.pixeloe-demo {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 2rem;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.controls-panel {
  background: #f8fafc;
  padding: 1.5rem;
  border-right: 1px solid #e2e8f0;
}

.control-group {
  margin-bottom: 2rem;
}

.control-group h3 {
  margin: 0 0 1rem 0;
  color: #2d3748;
  font-size: 1.1rem;
}

.file-input-container {
  position: relative;
}

#fileInput {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.file-input-label {
  display: block;
  padding: 0.75rem;
  background: #4299e1;
  color: white;
  border-radius: 6px;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.2s;
}

.file-input-label:hover {
  background: #3182ce;
}

.control-item {
  margin-bottom: 1rem;
}

.control-item label {
  display: block;
  margin-bottom: 0.5rem;
  color: #4a5568;
  font-weight: 500;
}

.control-item input[type="range"] {
  width: 100%;
}

.control-item select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 4px;
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.control-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.process-btn {
  padding: 0.75rem;
  background: #48bb78;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;
}

.process-btn:hover:not(:disabled) {
  background: #38a169;
}

.process-btn:disabled {
  background: #a0aec0;
  cursor: not-allowed;
}

.download-btn {
  padding: 0.75rem;
  background: #ed64a6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;
}

.download-btn:hover {
  background: #d53f8c;
}

.images-panel {
  padding: 1.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  justify-content: center;
  align-items: flex-start;
}

.image-container {
  text-align: center;
}

.image-container h3 {
  margin: 0 0 1rem 0;
  color: #2d3748;
}

.image-container canvas {
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.image-info {
  margin-top: 0.5rem;
  color: #718096;
  font-size: 0.9rem;
}

.processing-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: #4a5568;
}

.processing-tip {
  font-size: 0.9rem;
  color: #718096;
  font-style: italic;
}

.info-panel {
  background: #f7fafc;
  border: 2px dashed #cbd5e0;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  color: #4a5568;
}

.info-content h3 {
  margin-bottom: 1rem;
  color: #2d3748;
}

.info-content ul {
  text-align: left;
  max-width: 300px;
  margin: 0 auto;
}

.info-content li {
  margin-bottom: 0.5rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e2e8f0;
  border-top: 4px solid #4299e1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .pixeloe-demo {
    grid-template-columns: 1fr;
  }
  
  .controls-panel {
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
  }
}
</style>