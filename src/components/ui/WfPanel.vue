<script setup lang="ts">
withDefaults(defineProps<{
  open?: boolean
  title?: string
}>(), {
  open: false,
})

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="wf-panel-overlay" @click.self="emit('close')">
      <div class="wf-panel">
        <div class="wf-panel__header">
          <span class="wf-panel__title">{{ title }}</span>
          <button class="wf-panel__close" @click="emit('close')">
            ✕
          </button>
        </div>
        <div class="wf-panel__body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wf-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--color-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
}

.wf-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wf-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.wf-panel__title {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text);
}

.wf-panel__close {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
  padding: 0;
}

.wf-panel__close:hover {
  border-color: var(--color-border-hover);
  color: var(--color-text);
}

.wf-panel__body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
</style>
