<script setup lang="ts">
withDefaults(defineProps<{
  active?: boolean
  size?: 'sm' | 'md'
}>(), {
  active: false,
  size: 'md',
})

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    class="wf-chip"
    :class="[`wf-chip--${size}`, { active }]"
    @click="emit('click')"
  >
    <slot />
  </button>
</template>

<style scoped>
.wf-chip {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  user-select: none;
}

.wf-chip--sm {
  height: 26px;
  padding: 0 10px;
  font-size: 10px;
}
.wf-chip--md {
  height: 32px;
  padding: 0 14px;
}

.wf-chip:hover {
  border-color: var(--color-border-hover);
  color: var(--color-text);
}

.wf-chip.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
</style>
