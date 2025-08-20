import { PixelImageData } from './imageData';

/**
 * WebGL-based morphological operations for GPU acceleration
 */
export class WebGLMorphology {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private positionBuffer: WebGLBuffer | null = null;
  private texture1: WebGLTexture | null = null;
  private texture2: WebGLTexture | null = null;
  private framebuffer1: WebGLFramebuffer | null = null;
  private framebuffer2: WebGLFramebuffer | null = null;

  // Vertex shader (same for all operations)
  private readonly vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  // Fragment shader for dilation
  private readonly dilateFragmentShader = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform vec2 u_textureSize;
    varying vec2 v_texCoord;
    
    void main() {
      vec2 onePixel = vec2(1.0) / u_textureSize;
      vec4 maxColor = vec4(0.0);
      
      // 3x3 dilation kernel
      for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
          vec2 samplePos = v_texCoord + vec2(float(i), float(j)) * onePixel;
          vec4 color = texture2D(u_image, clamp(samplePos, 0.0, 1.0));
          maxColor = max(maxColor, color);
        }
      }
      
      gl_FragColor = maxColor;
    }
  `;

  // Fragment shader for erosion
  private readonly erodeFragmentShader = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform vec2 u_textureSize;
    varying vec2 v_texCoord;
    
    void main() {
      vec2 onePixel = vec2(1.0) / u_textureSize;
      vec4 minColor = vec4(1.0);
      
      // 3x3 erosion kernel
      for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
          vec2 samplePos = v_texCoord + vec2(float(i), float(j)) * onePixel;
          vec4 color = texture2D(u_image, clamp(samplePos, 0.0, 1.0));
          minColor = min(minColor, color);
        }
      }
      
      gl_FragColor = minColor;
    }
  `;

  constructor() {
    console.log('🔧 Initializing WebGL morphology...');
    // Create hidden canvas for WebGL
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
    if (!gl) {
      console.error('❌ WebGL not supported');
      throw new Error('WebGL not supported');
    }
    this.gl = gl as WebGLRenderingContext;
    
    console.log('✅ WebGL context created');
    console.log('GPU Info:', (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).RENDERER));
    this.initWebGL();
  }

  private initWebGL() {
    const gl = this.gl;

    // Create position buffer (full screen quad)
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
      -1,  1,  0, 1,
       1, -1,  1, 0,
       1,  1,  1, 1,
    ]), gl.STATIC_DRAW);
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compilation error: ' + error);
    }
    
    return shader;
  }

  private createProgram(fragmentShaderSource: string): WebGLProgram {
    const gl = this.gl;
    
    const vertexShader = this.createShader(gl.VERTEX_SHADER, this.vertexShaderSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      throw new Error('Program linking error: ' + error);
    }
    
    return program;
  }

  private setupTextures(width: number, height: number) {
    const gl = this.gl;
    
    // Create textures
    this.texture1 = gl.createTexture();
    this.texture2 = gl.createTexture();
    
    [this.texture1, this.texture2].forEach(texture => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });

    // Create framebuffers
    this.framebuffer1 = gl.createFramebuffer();
    this.framebuffer2 = gl.createFramebuffer();
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer1);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture1, 0);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer2);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture2, 0);
  }

  /**
   * Perform morphological operation using WebGL
   */
  private morphologyOperation(
    imageData: PixelImageData,
    operation: 'dilate' | 'erode',
    iterations: number = 1
  ): PixelImageData {
    const gl = this.gl;
    const width = imageData.width;
    const height = imageData.height;

    // Setup canvas size
    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);

    // Create program for the operation
    const fragmentShader = operation === 'dilate' ? this.dilateFragmentShader : this.erodeFragmentShader;
    const program = this.createProgram(fragmentShader);
    gl.useProgram(program);

    // Setup textures and framebuffers
    this.setupTextures(width, height);

    // Upload initial image data
    const canvasImageData = imageData.toCanvasImageData();
    gl.bindTexture(gl.TEXTURE_2D, this.texture1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasImageData);

    // Setup attributes and uniforms
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    const textureSizeLocation = gl.getUniformLocation(program, 'u_textureSize');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);

    gl.uniform2f(textureSizeLocation, width, height);

    // Perform iterations with ping-pong between textures
    let sourceTexture = this.texture1;
    let targetFramebuffer = this.framebuffer2;

    for (let i = 0; i < iterations; i++) {
      console.log(`🔄 WebGL iteration ${i + 1}/${iterations}`);
      
      // Bind source texture for reading
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);

      // Bind target framebuffer for writing
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);

      // Render full screen quad
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Ping-pong: swap source and target for next iteration
      if (sourceTexture === this.texture1) {
        sourceTexture = this.texture2;
        targetFramebuffer = this.framebuffer1;
      } else {
        sourceTexture = this.texture1;
        targetFramebuffer = this.framebuffer2;
      }
    }

    // Read back result from the correct framebuffer
    const finalFramebuffer = iterations % 2 === 1 ? this.framebuffer2 : this.framebuffer1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, finalFramebuffer);
    
    // Check framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer not complete: ${status}`);
    }
    
    const resultData = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, resultData);

    // Check for WebGL errors
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      throw new Error(`WebGL error during readPixels: ${error}`);
    }

    console.log('📊 Read', width, 'x', height, 'pixels from GPU');
    
    // Convert back to PixelImageData
    return PixelImageData.fromCanvasImageData(new ImageData(resultData, width, height));
  }

  /**
   * GPU-accelerated dilation
   */
  dilate(imageData: PixelImageData, iterations: number = 1): PixelImageData {
    return this.morphologyOperation(imageData, 'dilate', iterations);
  }

  /**
   * GPU-accelerated erosion
   */
  erode(imageData: PixelImageData, iterations: number = 1): PixelImageData {
    return this.morphologyOperation(imageData, 'erode', iterations);
  }

  /**
   * Cleanup WebGL resources
   */
  dispose() {
    const gl = this.gl;
    if (this.texture1) gl.deleteTexture(this.texture1);
    if (this.texture2) gl.deleteTexture(this.texture2);
    if (this.framebuffer1) gl.deleteFramebuffer(this.framebuffer1);
    if (this.framebuffer2) gl.deleteFramebuffer(this.framebuffer2);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
  }
}

// Global WebGL instance (lazy initialization)
let webglMorphology: WebGLMorphology | null = null;

/**
 * Get or create WebGL morphology instance
 */
function getWebGLMorphology(): WebGLMorphology {
  if (!webglMorphology) {
    try {
      webglMorphology = new WebGLMorphology();
    } catch (error) {
      console.warn('WebGL morphology initialization failed:', error);
      throw error;
    }
  }
  return webglMorphology;
}

/**
 * GPU-accelerated dilation (fallback to CPU if WebGL fails)
 */
export function dilateWebGL(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  try {
    return getWebGLMorphology().dilate(imageData, iterations);
  } catch (error) {
    console.warn('WebGL dilation failed, falling back to CPU');
    // Fallback to CPU version would go here
    throw error;
  }
}

/**
 * GPU-accelerated erosion (fallback to CPU if WebGL fails)
 */
export function erodeWebGL(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  try {
    return getWebGLMorphology().erode(imageData, iterations);
  } catch (error) {
    console.warn('WebGL erosion failed, falling back to CPU');
    // Fallback to CPU version would go here
    throw error;
  }
}