<script setup lang="ts">
import PixelOEDemo from './components/PixelOEDemo.vue'
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>PixelOE.js - 像素艺术生成器</h1>
      <p>基于对比度感知轮廓扩展的细节导向像素化</p>
    </header>
    <main>
      <PixelOEDemo />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.app-header {
  text-align: center;
  margin-bottom: 2rem;
}

.app-header h1 {
  color: white;
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.app-header p {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.1rem;
  margin: 0;
}

main {
  max-width: 1200px;
  margin: 0 auto;
}
</style>
