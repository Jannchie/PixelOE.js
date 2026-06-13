<script setup lang="ts">
import type { PixelOEPreset } from '../core/presets'
import type { PixelImageData, PixelOEOptions } from '../index'
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { getPresetPreview } from '../core/presetPreviews'
import { BASE_OPTIONS, PRESETS } from '../core/presets'
import { PixelOE } from '../index'
import PaletteSelector from './PaletteSelector.vue'
import PresetGallery from './PresetGallery.vue'
import WfButton from './ui/WfButton.vue'
import WfDropZone from './ui/WfDropZone.vue'

import WfSelect from './ui/WfSelect.vue'
import WfSlider from './ui/WfSlider.vue'
import WfSwitch from './ui/WfSwitch.vue'

const originalCanvas = ref<HTMLCanvasElement>()
const resultCanvas = ref<HTMLCanvasElement>()
const originalImage = ref<PixelImageData | null>(null)
const resultImage = ref<PixelImageData | null>(null)
const processing = ref(false)
// True while the canvas shows a preset's own sample image rather than one the
// user supplied. Switching presets re-loads samples; a user image is kept.
const imageIsExample = ref(false)

const showingOriginal = ref(false)
const processingTime = ref(0)

const sidebarTab = ref<'presets' | 'settings'>('presets')
const activePresetId = ref<string | null>('default')

const options = reactive<PixelOEOptions>({ ...BASE_OPTIONS })

const edgeExpansionModes = [
  { label: 'Legacy', value: 'legacy' },
  { label: 'Circle (PyTorch)', value: 'optimized' },
]

const processingModes = [
  { label: 'Contrast', value: 'contrast' },
]

let pixelOE: PixelOE
let pasteHandler: ((event: ClipboardEvent) => void) | null = null

onMounted(() => {
  pixelOE = new PixelOE(options)
  pasteHandler = (event: ClipboardEvent) => {
    const item = event.clipboardData?.items?.[0]
    if (item?.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        handleFile(file)
      }
    }
  }
  document.addEventListener('paste', pasteHandler)
  // First load: show the default preset applied to its own sample image.
  void applyPreset(PRESETS.find(p => p.id === 'default') ?? PRESETS[0])
})

onUnmounted(() => {
  if (pasteHandler) {
    document.removeEventListener('paste', pasteHandler)
  }
})

async function handleFile(file: File) {
  try {
    originalImage.value = await pixelOE.loadImage(file)
    imageIsExample.value = false
    resultImage.value = null
    await nextTick()
    drawOriginal()
    await processImage()
  }
  catch (error) {
    console.error('Error loading image:', error)
  }
}

function onCanvasDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0]
  if (file?.type.startsWith('image/')) {
    handleFile(file)
  }
}

/** Replace the canvas with a preset's downscaled source image. */
async function loadPresetSample(presetId: string) {
  const preview = getPresetPreview(presetId)
  if (!preview?.source) {
    return
  }
  try {
    originalImage.value = await pixelOE.loadImage(`${import.meta.env.BASE_URL}samples/${preview.source}`)
    imageIsExample.value = true
    resultImage.value = null
    await nextTick()
    drawOriginal()
  }
  catch (error) {
    console.error('Error loading preset sample:', error)
  }
}

function clearImage() {
  originalImage.value = null
  resultImage.value = null
  imageIsExample.value = false
}

function handleOptionsChange() {
  activePresetId.value = null
  pixelOE.setOptions(options)
}

async function applyPreset(preset: PixelOEPreset) {
  Object.assign(options, BASE_OPTIONS, preset.options)
  pixelOE?.setOptions(options)
  activePresetId.value = preset.id
  // With no user image (or while showing a sample), switch to this preset's
  // own sample image; a user-supplied image is kept and just re-processed.
  if (!originalImage.value || imageIsExample.value) {
    await loadPresetSample(preset.id)
  }
  if (originalImage.value) {
    await processImage()
  }
}

async function processImage() {
  if (!originalImage.value) {
    return
  }
  processing.value = true
  const t0 = performance.now()
  try {
    await new Promise(r => setTimeout(r, 50))
    const result = await pixelOE.pixelizeAsync(originalImage.value)
    resultImage.value = result.result
    processingTime.value = performance.now() - t0
    await nextTick()
    drawResult()
  }
  catch (error) {
    console.error('Error processing:', error)
  }
  finally {
    processing.value = false
  }
}

async function downloadResult() {
  if (!resultImage.value) {
    return
  }
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

function drawOriginal() {
  const ctx = originalCanvas.value?.getContext('2d')
  if (!ctx || !originalImage.value) {
    return
  }
  const img = originalImage.value.toCanvasImageData()
  ctx.clearRect(0, 0, originalCanvas.value!.width, originalCanvas.value!.height)
  ctx.putImageData(img, 0, 0)
}

function drawResult() {
  const ctx = resultCanvas.value?.getContext('2d')
  if (!ctx || !resultImage.value) {
    return
  }
  ctx.imageSmoothingEnabled = false
  const img = resultImage.value.toCanvasImageData()
  ctx.clearRect(0, 0, resultCanvas.value!.width, resultCanvas.value!.height)
  ctx.putImageData(img, 0, 0)
}
</script>

<template>
  <div class="demo">
    <div class="demo__editor">
      <!-- Main area: dropzone or canvas + actions -->
      <div class="demo__main">
        <div v-if="!originalImage" class="demo__upload">
          <WfDropZone @file="handleFile" />
        </div>
        <div v-else class="demo__canvas-wrap" @dragover.prevent @drop.prevent="onCanvasDrop">
          <div class="demo__canvas-header">
            <span class="demo__label">
              {{ showingOriginal ? 'orig' : resultImage ? 'result' : 'ready' }}
            </span>
            <span v-if="resultImage" class="demo__stats">
              {{ processingTime.toFixed(0) }}ms
            </span>
          </div>
          <div
            class="demo__canvas-area"
            :class="{ processing }"
            @mousedown="showingOriginal = !!resultImage"
            @mouseup="showingOriginal = false"
            @mouseleave="showingOriginal = false"
            @touchstart.prevent="showingOriginal = !!resultImage"
            @touchend="showingOriginal = false"
            @touchcancel="showingOriginal = false"
          >
            <canvas
              ref="originalCanvas"
              :width="originalImage.width"
              :height="originalImage.height"
              class="demo__canvas"
              :class="{ hidden: !showingOriginal && !!resultImage }"
            />
            <canvas
              v-if="resultImage"
              ref="resultCanvas"
              :width="resultImage.width"
              :height="resultImage.height"
              class="demo__canvas pixel-art"
              :class="{ hidden: showingOriginal }"
            />
            <div v-if="processing" class="demo__processing">
              <span class="demo__spinner" />
              <span>processing...</span>
            </div>
          </div>
          <div class="demo__canvas-hint">
            <span v-if="resultImage">hold to compare with original{{ imageIsExample ? ' · drop your own to replace' : '' }}</span>
            <span v-else>adjust settings → generate</span>
          </div>
        </div>

        <!-- Actions bar -->
        <div v-if="originalImage" class="demo__actions">
          <WfButton variant="primary" :loading="processing" @click="processImage">
            generate
          </WfButton>
          <WfButton variant="secondary" @click="clearImage">
            new
          </WfButton>
          <WfButton v-if="resultImage" variant="secondary" @click="downloadResult">
            download
          </WfButton>
        </div>
      </div>

      <!-- Settings sidebar -->
      <aside class="demo__sidebar">
        <div class="demo__sidebar-head">
          <div class="demo__tabs">
            <button
              type="button"
              class="demo__tab"
              :class="{ active: sidebarTab === 'presets' }"
              @click="sidebarTab = 'presets'"
            >
              presets
            </button>
            <button
              type="button"
              class="demo__tab"
              :class="{ active: sidebarTab === 'settings' }"
              @click="sidebarTab = 'settings'"
            >
              settings
            </button>
          </div>
        </div>
        <PresetGallery
          v-if="sidebarTab === 'presets'"
          class="demo__gallery"
          :active-id="activePresetId"
          @select="applyPreset"
        />
        <div v-else class="demo__sidebar-body">
          <div class="settings">
            <!-- Sliders -->
            <section class="settings__section">
              <div class="settings__grid">
                <div class="settings__item">
                  <WfSlider
                    v-model="options.pixelSize"
                    :min="2"
                    :max="16"
                    :step="1"
                    label="Pixel Size"
                    @update:model-value="handleOptionsChange"
                  />
                  <span class="settings__val">{{ options.pixelSize }}</span>
                </div>
                <div class="settings__item">
                  <WfSlider
                    :model-value="options.targetSize ?? 256"
                    :min="64"
                    :max="512"
                    :step="16"
                    label="Target Size"
                    @update:model-value="options.targetSize = $event; handleOptionsChange()"
                  />
                  <span class="settings__val">{{ options.targetSize }}</span>
                </div>
                <div class="settings__item">
                  <WfSlider
                    v-model="options.thickness"
                    :min="0"
                    :max="10"
                    :step="1"
                    label="Outline"
                    @update:model-value="handleOptionsChange"
                  />
                  <span class="settings__val">{{ options.thickness }}</span>
                </div>
                <div class="settings__item">
                  <WfSlider
                    v-model="options.contrast"
                    :min="0.5"
                    :max="2"
                    :step="0.1"
                    label="Contrast"
                    @update:model-value="handleOptionsChange"
                  />
                  <span class="settings__val">{{ options.contrast.toFixed(1) }}</span>
                </div>
                <div class="settings__item">
                  <WfSlider
                    v-model="options.saturation"
                    :min="0.5"
                    :max="2"
                    :step="0.1"
                    label="Saturation"
                    @update:model-value="handleOptionsChange"
                  />
                  <span class="settings__val">{{ options.saturation.toFixed(1) }}</span>
                </div>
              </div>
            </section>

            <!-- Algorithm -->
            <section class="settings__section">
              <h4 class="settings__heading">
                algorithm
              </h4>
              <div class="settings__row">
                <span class="settings__row-label">Mode</span>
                <WfSelect
                  v-model="options.mode"
                  :options="processingModes"
                  @update:model-value="handleOptionsChange"
                />
              </div>
              <div class="settings__row">
                <span class="settings__row-label">Edge Expansion</span>
                <WfSelect
                  v-model="options.edgeExpansionMode"
                  :options="edgeExpansionModes"
                  @update:model-value="handleOptionsChange"
                />
              </div>
            </section>

            <!-- Palette -->
            <section class="settings__section">
              <h4 class="settings__heading">
                palette
              </h4>
              <PaletteSelector
                v-model:use-palette="options.usePalette"
                v-model:selected-palette="options.selectedPalette"
                v-model:dither-method="options.ditherMethod"
                @update:use-palette="handleOptionsChange"
                @update:selected-palette="handleOptionsChange"
                @update:dither-method="handleOptionsChange"
              />
            </section>

            <!-- Toggles -->
            <section class="settings__section">
              <h4 class="settings__heading">
                options
              </h4>
              <div class="settings__toggles">
                <WfSwitch
                  v-model="options.colorMatching"
                  label="Color Matching"
                  @update:model-value="handleOptionsChange"
                />
                <WfSwitch
                  v-model="options.noUpscale"
                  label="Disable Upscale"
                  @update:model-value="handleOptionsChange"
                />
                <WfSwitch
                  v-model="options.noDownscale"
                  label="Disable Downscale"
                  @update:model-value="handleOptionsChange"
                />
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.demo {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Upload */
.demo__upload {
  flex: 1;
  min-height: 0;
}

/* Editor layout */
.demo__editor {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Main (canvas + actions) */
.demo__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 24px 16px 24px 24px;
  gap: 16px;
  overflow: hidden;
}

/* Canvas */
.demo__canvas-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  overflow: hidden;
}

.demo__canvas-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.demo__label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.demo__stats {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}

.demo__canvas-area {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-image:
    linear-gradient(45deg, var(--color-checker) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-checker) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-checker) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-checker) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}

.demo__canvas-area.processing {
  opacity: 0.6;
}

.demo__canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: opacity 0.15s;
}
.demo__canvas.hidden {
  opacity: 0;
  position: absolute;
}

.demo__processing {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-overlay);
  backdrop-filter: blur(2px);
}

.demo__spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.demo__canvas-hint {
  padding: 6px 12px;
  border-top: 1px solid var(--color-border);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
  text-align: center;
  flex-shrink: 0;
}

/* Actions */
.demo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

/* Sidebar */
.demo__sidebar {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.demo__sidebar-head {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.demo__tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg);
}

.demo__tab {
  flex: 1;
  height: 28px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.demo__tab:hover {
  color: var(--color-text);
}

.demo__tab.active {
  background: var(--color-surface-raised);
  color: var(--color-accent);
  box-shadow: inset 0 0 0 1px var(--color-border);
}

.demo__gallery {
  flex: 1;
  min-height: 0;
}

.demo__sidebar-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

/* Settings */
.settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings__heading {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border);
}

.settings__grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings__item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.settings__item > :first-child {
  flex: 1;
}

.settings__val {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
  min-width: 36px;
  text-align: right;
}

.settings__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings__row-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.settings__toggles {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Mobile: stack settings below canvas */
@media (max-width: 767px) {
  .demo__editor {
    flex-direction: column;
  }

  .demo__main {
    padding: 16px;
    flex: none;
    height: 55%;
    min-height: 320px;
  }

  .demo__sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--color-border);
    flex: 1;
    min-height: 0;
  }

  .demo__sidebar-body {
    padding: 16px;
  }
}
</style>
