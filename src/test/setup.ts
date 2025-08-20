// Test setup for PixelOE.js
// This file is referenced in vitest.config.ts

// Enable performance measurements
if (typeof performance === 'undefined') {
  // Polyfill performance for older Node.js versions
  global.performance = {
    now: () => Date.now()
  } as Performance
}

// Memory cleanup helper
global.gc = global.gc || (() => {})

// Console formatting for better test output
const originalLog = console.log
console.log = (...args) => {
  const timestamp = new Date().toLocaleTimeString()
  originalLog(`[${timestamp}]`, ...args)
}