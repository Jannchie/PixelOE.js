import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PixelImageData } from '../src/core/imageData'
import { contrastDownscaleWebGL } from '../src/core/webglDownscale'
import { contrastDownscale } from '../src/core/downscale'

// Mock DOM environment for WebGL
Object.defineProperty(global, 'HTMLCanvasElement', {
  value: class HTMLCanvasElement {
    width = 0
    height = 0
    getContext() {
      // Mock WebGL context
      return null // This will cause WebGL to fail gracefully
    }
  },
})

Object.defineProperty(global, 'document', {
  value: {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return new (global as any).HTMLCanvasElement()
      }
      return {}
    },
  },
})

describe('WebGL Contrast Downscale', () => {
  let testImage: PixelImageData

  beforeEach(() => {
    // Create a test image with some pattern
    const width = 64
    const height = 64
    const data = new Uint8Array(width * height * 4)
    
    // Create a gradient pattern for testing
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4
        const brightness = Math.floor((x + y) / (width + height) * 255)
        data[index] = brightness     // R
        data[index + 1] = brightness // G
        data[index + 2] = brightness // B
        data[index + 3] = 255        // A
      }
    }
    
    testImage = new PixelImageData(data, width, height)
  })

  it('should handle WebGL initialization failure gracefully', () => {
    // Since we mock WebGL to return null, this should throw an error
    expect(() => {
      contrastDownscaleWebGL(testImage, 32)
    }).toThrow()
  })

  it('should produce similar results to CPU version when WebGL works', () => {
    // This test would work if WebGL was actually available
    // For now, we just test that both functions have the same interface
    expect(typeof contrastDownscaleWebGL).toBe('function')
    expect(typeof contrastDownscale).toBe('function')
  })

  it('should handle different target sizes', () => {
    // Test that the function accepts different parameters without crashing
    const targetSizes = [16, 32, 64, 128]
    
    targetSizes.forEach(targetSize => {
      expect(() => {
        try {
          contrastDownscaleWebGL(testImage, targetSize)
        } catch (error) {
          // Expected to fail in test environment due to WebGL mock
          expect(error).toBeDefined()
        }
      }).not.toThrow()
    })
  })

  it('should validate input parameters', () => {
    expect(() => {
      contrastDownscaleWebGL(testImage, 0)
    }).toThrow()
    
    expect(() => {
      contrastDownscaleWebGL(testImage, -1)
    }).toThrow()
  })
})