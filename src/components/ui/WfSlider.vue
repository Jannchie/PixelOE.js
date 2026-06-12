<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  label?: string
}>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const trackRef = ref<HTMLDivElement>()

const percentage = computed(() => {
  const range = props.max - props.min
  return range === 0 ? 0 : ((props.modelValue - props.min) / range) * 100
})

function onTrackClick(e: MouseEvent) {
  if (props.disabled || !trackRef.value) {
    return
  }
  const rect = trackRef.value.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const raw = props.min + ratio * (props.max - props.min)
  emit('update:modelValue', roundToStep(raw))
}

function onTrackDrag(e: MouseEvent) {
  if (props.disabled || !trackRef.value) {
    return
  }
  const rect = trackRef.value.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const raw = props.min + ratio * (props.max - props.min)
  emit('update:modelValue', roundToStep(raw))
}

function onDragStart() {
  if (props.disabled) {
    return
  }
  const onUp = (): void => {
    document.removeEventListener('mousemove', onTrackDrag)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onTrackDrag)
  document.addEventListener('mouseup', onUp)
}

function roundToStep(value: number): number {
  const s = props.step
  // Handle floating point steps
  const decimals = (s.toString().split('.')[1] || '').length
  const rounded = Math.round((value - props.min) / s) * s + props.min
  const clamped = Math.max(props.min, Math.min(props.max, rounded))
  return Number(clamped.toFixed(decimals))
}
</script>

<template>
  <div class="wf-slider" :class="{ disabled }">
    <div v-if="label" class="wf-slider__label">
      <span>{{ label }}</span>
    </div>
    <div
      ref="trackRef"
      class="wf-slider__track"
      @mousedown="onTrackClick"
    >
      <div class="wf-slider__fill" :style="{ width: `${percentage}%` }" />
      <div
        class="wf-slider__thumb"
        :style="{ left: `${percentage}%` }"
        @mousedown.prevent="onDragStart"
      />
    </div>
  </div>
</template>

<style scoped>
.wf-slider {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wf-slider__label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.wf-slider__track {
  position: relative;
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  cursor: pointer;
  user-select: none;
}

.wf-slider__fill {
  position: absolute;
  height: 100%;
  background: var(--color-accent);
  border-radius: 3px;
  transition: width 0.05s linear;
}

.wf-slider__thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  background: var(--color-bg);
  border: 1px solid var(--color-accent);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: left 0.05s linear;
  cursor: grab;
}

.wf-slider__thumb:active {
  cursor: grabbing;
  background: var(--color-accent);
}

.wf-slider.disabled {
  opacity: 0.35;
  pointer-events: none;
}
</style>
