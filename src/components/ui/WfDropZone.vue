<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  file: [file: File]
}>()

const dragOver = ref(false)
const inputRef = ref<HTMLInputElement>()

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (files?.length) {
    emit('file', files[0])
  }
}

function onInputChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length) {
    emit('file', files[0])
  }
}

function openFileDialog() {
  inputRef.value?.click()
}
</script>

<template>
  <div
    class="wf-dropzone"
    :class="{ 'drag-over': dragOver }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @click="openFileDialog"
  >
    <input
      ref="inputRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onInputChange"
    >
    <div class="wf-dropzone__inner">
      <div class="wf-dropzone__icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="8" width="40" height="32" stroke="currentColor" stroke-width="1" />
          <circle cx="16" cy="18" r="4" stroke="currentColor" stroke-width="1" />
          <path d="M8 36 L18 26 L26 32 L34 20 L40 36" stroke="currentColor" stroke-width="1" />
        </svg>
      </div>
      <p class="wf-dropzone__title">
        DROP IMAGE HERE
      </p>
      <p class="wf-dropzone__hint">
        PNG, JPG, WEBP — or paste from clipboard
      </p>
    </div>
  </div>
</template>

<style scoped>
.wf-dropzone {
  width: 100%;
  height: 100%;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.wf-dropzone:hover,
.wf-dropzone.drag-over {
  border-color: var(--color-border-hover);
  background: rgba(255,255,255,0.03);
}

.wf-dropzone.drag-over {
  border-style: solid;
  background: rgba(108, 198, 242, 0.08);
  border-color: var(--color-accent-dim);
}

.wf-dropzone__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.wf-dropzone__icon {
  color: var(--color-text-muted);
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
}

.wf-dropzone__title {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--color-text);
  margin-bottom: 4px;
}

.wf-dropzone__hint {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.hidden {
  display: none;
}
</style>
