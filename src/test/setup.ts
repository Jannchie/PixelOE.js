// Test setup for PixelOE.js
// This file is referenced in vitest.config.ts

// Type declarations for global variables
declare global {
  var gc: (() => void) | undefined
}

// Enable performance measurements
if (typeof performance === 'undefined') {
  // Polyfill performance for older Node.js versions
  globalThis.performance = {
    now: () => Date.now(),
  } as Performance
}

// Memory cleanup helper
globalThis.gc = globalThis.gc || (() => {})

// ImageData polyfill for Node.js testing environment
if (typeof ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray
    width: number
    height: number

    constructor(data: Uint8ClampedArray | number, width?: number, height?: number) {
      if (typeof data === 'number') {
        // new ImageData(width, height)
        this.width = data
        this.height = width!
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      } else {
        // new ImageData(data, width, height)
        this.data = data
        this.width = width!
        this.height = height!
      }
    }
  }

  globalThis.ImageData = ImageDataPolyfill as any
}

// Console formatting for better test output
const originalLog = console.log
console.log = (...args) => {
  const timestamp = new Date().toLocaleTimeString()
  originalLog(`[${timestamp}]`, ...args)
}
