<script setup lang="ts">
import type { PixelOEPreset } from '../core/presets'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Waterfall } from 'vue-wf'
import { getPresetPreview, PRESET_PREVIEWS } from '../core/presetPreviews'
import { PRESETS } from '../core/presets'

defineProps<{
  activeId: string | null
}>()

const emit = defineEmits<{
  select: [preset: PixelOEPreset]
}>()

const GAP = 10
const CAPTION_H = 46

const rootRef = ref<HTMLDivElement>()
const innerRef = ref<HTMLDivElement>()
const innerWidth = ref(0)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    innerWidth.value = entries[0]?.contentRect.width ?? 0
  })
  if (innerRef.value) {
    resizeObserver.observe(innerRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

const cols = computed(() => {
  const n = Math.floor((innerWidth.value + GAP) / (130 + GAP))
  return Math.min(3, Math.max(2, n))
})

const itemWidth = computed(() =>
  Math.floor((innerWidth.value - GAP * (cols.value - 1)) / cols.value),
)

function previewSrc(id: string): string | undefined {
  const preview = getPresetPreview(id)
  return preview ? `${import.meta.env.BASE_URL}presets/${preview.file}` : undefined
}

function thumbHeight(id: string): number {
  const preview = getPresetPreview(id)
  const aspect = preview ? preview.height / preview.width : 1
  return Math.round(itemWidth.value * Math.min(2.2, Math.max(0.4, aspect)))
}

const wfItems = computed(() =>
  PRESETS.map(p => ({
    width: itemWidth.value,
    height: thumbHeight(p.id) + CAPTION_H,
  })),
)

const hasPreviews = PRESET_PREVIEWS.length > 0
</script>

<template>
  <div ref="rootRef" class="gallery">
    <div class="gallery__status">
      <span class="gallery__status-text">tap a style to apply</span>
    </div>
    <div ref="innerRef" class="gallery__inner">
      <Waterfall
        v-if="innerWidth > 0"
        :items="wfItems"
        :wrapper-width="innerWidth"
        :item-width="itemWidth"
        :cols="cols"
        :gap="GAP"
        :scroll-element="rootRef"
      >
        <button
          v-for="preset in PRESETS"
          :key="preset.id"
          type="button"
          class="gallery__card"
          :class="{ active: preset.id === activeId }"
          :title="preset.description"
          @click="emit('select', preset)"
        >
          <span class="gallery__thumb" :style="{ height: `${thumbHeight(preset.id)}px` }">
            <img
              v-if="hasPreviews && previewSrc(preset.id)"
              :src="previewSrc(preset.id)"
              :alt="preset.name"
              class="gallery__img pixel-art"
              loading="lazy"
              draggable="false"
            >
            <span v-else class="gallery__placeholder">{{ preset.name }}</span>
          </span>
          <span class="gallery__caption">
            <span class="gallery__name">{{ preset.name }}</span>
            <span class="gallery__desc">{{ preset.description }}</span>
          </span>
        </button>
      </Waterfall>
    </div>
  </div>
</template>

<style scoped>
.gallery {
  height: 100%;
  overflow-y: auto;
  padding: 12px 16px 16px;
}

.gallery__status {
  padding: 2px 2px 10px;
}

.gallery__status-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.gallery__card {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  cursor: pointer;
  overflow: hidden;
  text-align: left;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.gallery__card:hover {
  border-color: var(--color-border-hover);
  transform: translateY(-1px);
}

.gallery__card.active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent);
}

.gallery__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  overflow: hidden;
  background-image:
    linear-gradient(45deg, var(--color-checker) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-checker) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-checker) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-checker) 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0;
}

.gallery__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

.gallery__placeholder {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}

.gallery__caption {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 9px 8px;
  border-top: 1px solid var(--color-border);
}

.gallery__name {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gallery__card.active .gallery__name {
  color: var(--color-accent);
}

.gallery__desc {
  font-size: 10px;
  color: var(--color-text-muted);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
