import { PixelImageData } from './imageData'
import { contrastDownscale } from './downscale'

/**
 * WebGL-based contrast downscaling for GPU acceleration
 */
export class WebGLContrastDownscale {
  private gl: WebGLRenderingContext
  private canvas: HTMLCanvasElement
  private positionBuffer: WebGLBuffer | null = null
  private statsTexture: WebGLTexture | null = null
  private resultTexture: WebGLTexture | null = null
  private statsFramebuffer: WebGLFramebuffer | null = null
  private resultFramebuffer: WebGLFramebuffer | null = null

  // Vertex shader
  private readonly vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `

  // Fragment shader for computing patch statistics
  private readonly statsFragmentShader = `
    precision highp float;
    uniform sampler2D u_image;
    uniform vec2 u_textureSize;
    uniform float u_patchSize;
    varying vec2 v_texCoord;
    
    // Convert RGB to L*a*b* luminance
    float rgbToLuminance(vec3 rgb) {
      // Simple approximation for WebGL
      return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    }
    
    void main() {
      vec2 patchCoord = floor(v_texCoord * u_textureSize / u_patchSize) * u_patchSize;
      vec2 patchStart = patchCoord / u_textureSize;
      vec2 patchEnd = min((patchCoord + u_patchSize) / u_textureSize, vec2(1.0));
      
      float minLum = 1.0;
      float maxLum = 0.0;
      float sumLum = 0.0;
      float count = 0.0;
      
      // Sample patch (fixed size for WebGL 1.0 compatibility)
      float step = u_patchSize / u_textureSize.x;
      for (float y = 0.0; y < 1.0; y += 0.125) {
        for (float x = 0.0; x < 1.0; x += 0.125) {
          if (x > 1.0 || y > 1.0) break;
          
          vec2 samplePos = patchStart + vec2(x, y) * step;
          if (samplePos.x >= patchEnd.x || samplePos.y >= patchEnd.y) continue;
          
          vec3 color = texture2D(u_image, samplePos).rgb;
          float lum = rgbToLuminance(color);
          
          minLum = min(minLum, lum);
          maxLum = max(maxLum, lum);
          sumLum += lum;
          count += 1.0;
        }
      }
      
      float meanLum = count > 0.0 ? sumLum / count : 0.0;
      
      // Pack statistics into RGBA
      gl_FragColor = vec4(minLum, maxLum, meanLum, count);
    }
  `

  // Fragment shader for contrast-based pixel selection
  private readonly contrastFragmentShader = `
    precision highp float;
    uniform sampler2D u_image;
    uniform sampler2D u_stats;
    uniform vec2 u_textureSize;
    uniform float u_patchSize;
    varying vec2 v_texCoord;
    
    float rgbToLuminance(vec3 rgb) {
      return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    }
    
    void main() {
      vec2 patchCoord = floor(v_texCoord * u_textureSize / u_patchSize) * u_patchSize;
      vec2 patchStart = patchCoord / u_textureSize;
      
      // Get patch statistics
      vec4 stats = texture2D(u_stats, v_texCoord);
      float minLum = stats.r;
      float maxLum = stats.g; 
      float meanLum = stats.b;
      
      // Estimate median (approximation using mean and extremes)
      float medianLum = (minLum + maxLum + 2.0 * meanLum) / 4.0;
      
      // Apply contrast selection logic
      bool cond1 = (medianLum < meanLum) && ((maxLum - medianLum) > (medianLum - minLum));
      bool cond2 = (medianLum > meanLum) && ((maxLum - medianLum) < (medianLum - minLum));
      
      float targetLum;
      if (cond1) {
        targetLum = minLum;
      } else if (cond2) {
        targetLum = maxLum;
      } else {
        // Use middle pixel as default
        targetLum = medianLum;
      }
      
      // Find pixel closest to target luminance in patch
      vec3 bestColor = vec3(0.0);
      float bestDiff = 999.0;
      
      float step = u_patchSize / u_textureSize.x;
      for (float y = 0.0; y < 1.0; y += 0.125) {
        for (float x = 0.0; x < 1.0; x += 0.125) {
          if (x > 1.0 || y > 1.0) break;
          
          vec2 samplePos = patchStart + vec2(x, y) * step;
          vec3 color = texture2D(u_image, samplePos).rgb;
          float lum = rgbToLuminance(color);
          float diff = abs(lum - targetLum);
          
          if (diff < bestDiff) {
            bestDiff = diff;
            bestColor = color;
          }
        }
      }
      
      gl_FragColor = vec4(bestColor, 1.0);
    }
  `

  constructor() {
    console.log('🔧 Initializing WebGL contrast downscale...')
    this.canvas = document.createElement('canvas')
    const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl')
    if (!gl) {
      throw new Error('WebGL not supported')
    }
    this.gl = gl as WebGLRenderingContext

    // Enable required extensions
    const ext = this.gl.getExtension('OES_texture_float')
    if (!ext) {
      console.warn('Float textures not supported, using reduced precision')
    }

    console.log('✅ WebGL contrast downscale initialized')
    this.initWebGL()
  }

  private initWebGL() {
    const gl = this.gl

    // Create position buffer (full screen quad)
    this.positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1,
    ]), gl.STATIC_DRAW)
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl
    const shader = gl.createShader(type)
    if (!shader) {
      throw new Error('Failed to create shader')
    }

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`Shader compilation error: ${error}`)
    }

    return shader
  }

  private createProgram(fragmentShaderSource: string): WebGLProgram {
    const gl = this.gl

    const vertexShader = this.createShader(gl.VERTEX_SHADER, this.vertexShaderSource)
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource)

    const program = gl.createProgram()
    if (!program) {
      throw new Error('Failed to create program')
    }

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program)
      throw new Error(`Program linking error: ${error}`)
    }

    return program
  }

  private setupTextures(width: number, height: number) {
    const gl = this.gl

    // Create textures for intermediate results
    this.statsTexture = gl.createTexture()
    this.resultTexture = gl.createTexture()

    for (const texture of [this.statsTexture, this.resultTexture]) {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }

    // Create framebuffers
    this.statsFramebuffer = gl.createFramebuffer()
    this.resultFramebuffer = gl.createFramebuffer()

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.statsFramebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.statsTexture, 0)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resultFramebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.resultTexture, 0)
  }

  /**
   * Perform contrast-based downscaling using WebGL
   */
  contrastDownscale(imageData: PixelImageData, targetSize: number = 128): PixelImageData {
    if (targetSize <= 0) {
      throw new Error('Target size must be positive')
    }
    
    const gl = this.gl
    const { width, height } = imageData
    
    // Calculate patch size
    const ratio = width / height
    const adjustedTargetSize = Math.sqrt((targetSize * targetSize) / ratio)
    const targetHW: [number, number] = [
      Math.floor(adjustedTargetSize * ratio),
      Math.floor(adjustedTargetSize),
    ]
    
    const patchSize = Math.max(
      Math.round(height / targetHW[1]),
      Math.round(width / targetHW[0]),
    )

    console.log(`🔧 WebGL contrast downscale: targetSize=${targetSize}, patchSize=${patchSize}`)

    // Setup canvas and viewport
    this.canvas.width = width
    this.canvas.height = height
    gl.viewport(0, 0, width, height)

    // Setup textures and framebuffers
    this.setupTextures(width, height)

    // Upload source image
    const canvasImageData = imageData.toCanvasImageData()
    const sourceTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasImageData)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

    // Setup vertex attributes
    const setupAttributes = (program: WebGLProgram) => {
      const positionLocation = gl.getAttribLocation(program, 'a_position')
      const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.enableVertexAttribArray(positionLocation)
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0)
      gl.enableVertexAttribArray(texCoordLocation)
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8)
    }

    // Pass 1: Compute statistics
    const statsProgram = this.createProgram(this.statsFragmentShader)
    gl.useProgram(statsProgram)
    setupAttributes(statsProgram)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture)
    gl.uniform1i(gl.getUniformLocation(statsProgram, 'u_image'), 0)
    gl.uniform2f(gl.getUniformLocation(statsProgram, 'u_textureSize'), width, height)
    gl.uniform1f(gl.getUniformLocation(statsProgram, 'u_patchSize'), patchSize)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.statsFramebuffer)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Pass 2: Apply contrast selection
    const contrastProgram = this.createProgram(this.contrastFragmentShader)
    gl.useProgram(contrastProgram)
    setupAttributes(contrastProgram)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture)
    gl.uniform1i(gl.getUniformLocation(contrastProgram, 'u_image'), 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.statsTexture)
    gl.uniform1i(gl.getUniformLocation(contrastProgram, 'u_stats'), 1)

    gl.uniform2f(gl.getUniformLocation(contrastProgram, 'u_textureSize'), width, height)
    gl.uniform1f(gl.getUniformLocation(contrastProgram, 'u_patchSize'), patchSize)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resultFramebuffer)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Read back result
    const resultData = new Uint8ClampedArray(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, resultData)

    // Clean up temporary texture
    gl.deleteTexture(sourceTexture)

    // Convert to PixelImageData and resize to target
    const processedImage = PixelImageData.fromCanvasImageData(new ImageData(resultData, width, height))
    
    // Use nearest neighbor for final resize to maintain pixelated look
    return this.resizeNearest(processedImage, targetHW[0], targetHW[1])
  }

  private resizeNearest(imageData: PixelImageData, newWidth: number, newHeight: number): PixelImageData {
    const { width, height, data } = imageData
    const newData = new Uint8ClampedArray(newWidth * newHeight * 4)
    
    const xRatio = width / newWidth
    const yRatio = height / newHeight
    
    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcX = Math.floor(x * xRatio)
        const srcY = Math.floor(y * yRatio)
        const srcIndex = (srcY * width + srcX) * 4
        const destIndex = (y * newWidth + x) * 4
        
        newData[destIndex] = data[srcIndex]
        newData[destIndex + 1] = data[srcIndex + 1]
        newData[destIndex + 2] = data[srcIndex + 2]
        newData[destIndex + 3] = data[srcIndex + 3]
      }
    }
    
    return new PixelImageData(newWidth, newHeight, new Uint8ClampedArray(newData))
  }

  /**
   * Cleanup WebGL resources
   */
  dispose() {
    const gl = this.gl
    if (this.statsTexture) gl.deleteTexture(this.statsTexture)
    if (this.resultTexture) gl.deleteTexture(this.resultTexture)
    if (this.statsFramebuffer) gl.deleteFramebuffer(this.statsFramebuffer)
    if (this.resultFramebuffer) gl.deleteFramebuffer(this.resultFramebuffer)
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer)
  }
}

// Global WebGL instance
let webglContrastDownscale: WebGLContrastDownscale | null = null

/**
 * Get or create WebGL contrast downscale instance
 */
function getWebGLContrastDownscale(): WebGLContrastDownscale {
  if (!webglContrastDownscale) {
    try {
      webglContrastDownscale = new WebGLContrastDownscale()
    } catch (error) {
      console.warn('WebGL contrast downscale initialization failed:', error)
      throw error
    }
  }
  return webglContrastDownscale
}

/**
 * GPU-accelerated contrast downscaling (with CPU fallback)
 */
export function contrastDownscaleWebGL(
  imageData: PixelImageData, 
  targetSize: number = 128
): PixelImageData {
  try {
    return getWebGLContrastDownscale().contrastDownscale(imageData, targetSize)
  } catch (error) {
    console.warn('WebGL contrast downscale failed, falling back to CPU:', error)
    // Fallback to CPU version
    return contrastDownscale(imageData, targetSize)
  }
}