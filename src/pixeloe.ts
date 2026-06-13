import type { DitherMethod } from './core/dithering'
import type { ColorPalette } from './core/palettes'
import type { SharpenMode } from './core/sharpen'
import { colorStyling } from './core/color'
import { matchColorFast } from './core/colorOptimizedFast'
import { contrastDownscale } from './core/downscale'
import { contourDownscale } from './core/contourPixelize'
import { contrastDownscaleMRF } from './core/downscaleMRF'
import { PixelImageData } from './core/imageData'
import { resizeImageSync } from './core/imageResize'
import { outlineExpansion, outlineExpansionOptimized, outlineExpansionOptimizedAsync } from './core/outline'
// Morphology imports removed as no longer needed
import { quantizeAndDither, quantizeToPalette } from './core/quantization'
import { applySharpen } from './core/sharpen'

/**
 * PixelOE configuration options
 */
export interface PixelOEOptions {
  pixelSize: number // patch_size in Python demo
  thickness: number // thickness in Python demo
  targetSize?: number // target_size in Python demo (new parameter)
  mode: 'contrast'
  downscaleMethod?: 'contrast' | 'mrf' | 'mrf-rescue' | 'contour' // greedy heuristic / MRF labeling / greedy+MRF rescue / contour re-rasterization (experimental)
  mrfAA?: boolean // MRF only: blend low-coverage structure patches toward center (pixel-art AA convention)
  colorMatching: boolean
  contrast: number
  saturation: number
  noUpscale: boolean
  noDownscale: boolean

  // New options from Python version
  sharpenMode?: SharpenMode // Sharpening algorithm
  sharpenStrength?: number // Sharpening strength
  doQuantization?: boolean // Enable color quantization
  numColors?: number // Number of colors for quantization
  ditherMethod?: DitherMethod // Dithering method
  quantMode?: 'kmeans' // Quantization algorithm (for future extensibility)
  noPostUpscale?: boolean // Skip final upscaling
  resampleMethod?: 'lanczos' | 'bicubic' | 'auto' // High-quality resampling method

  // Palette options
  usePalette?: boolean // Use predefined color palette
  selectedPalette?: ColorPalette // Selected color palette

  // Advanced edge expansion options
  edgeExpansionMode?: 'legacy' | 'optimized' // Edge expansion algorithm
  edgeDetectionThreshold?: number // Edge detection sensitivity (0.0-1.0)
  useEdgeOptimization?: boolean // Enable edge-aware processing
  adaptiveProcessing?: boolean // Use adaptive region-of-interest processing
}

/**
 * PixelOE processing result
 */
export interface PixelOEResult {
  result: PixelImageData
  intermediate?: PixelImageData
  weights?: Float32Array
}

/**
 * Main PixelOE class for pixel art generation
 */
export class PixelOE {
  private options: PixelOEOptions

  constructor(options: Partial<PixelOEOptions> = {}) {
    this.options = {
      pixelSize: 6, // patch_size
      thickness: 3, // thickness
      targetSize: 128, // target_size
      mode: 'contrast',
      downscaleMethod: 'contrast',
      colorMatching: true,
      contrast: 1,
      saturation: 1,
      noUpscale: false,
      noDownscale: false,

      // New default options
      sharpenMode: 'none',
      sharpenStrength: 1,
      doQuantization: false,
      numColors: 32,
      ditherMethod: 'none',
      quantMode: 'kmeans',
      noPostUpscale: false,
      resampleMethod: 'auto',

      // Palette defaults
      usePalette: false,
      selectedPalette: undefined,

      // Advanced edge expansion defaults
      edgeExpansionMode: 'optimized',
      edgeDetectionThreshold: 0.1,
      useEdgeOptimization: true,
      adaptiveProcessing: true,

      ...options,
    }
  }

  /**
   * Update options
   */
  setOptions(options: Partial<PixelOEOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /**
   * Get current options
   */
  getOptions(): PixelOEOptions {
    return { ...this.options }
  }

  /**
   * Load image from various sources
   */
  async loadImage(source: string | HTMLImageElement | File | PixelImageData): Promise<PixelImageData> {
    if (source instanceof PixelImageData) {
      return source
    }

    if (typeof source === 'string') {
      return this.loadImageFromUrl(source)
    }

    if (source instanceof HTMLImageElement) {
      return this.imageElementToPixelImageData(source)
    }

    if (source instanceof File) {
      return this.loadImageFromFile(source)
    }

    throw new Error('Unsupported image source type')
  }

  /**
   * Load image from URL
   */
  private async loadImageFromUrl(url: string): Promise<PixelImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.addEventListener('load', () => {
        try {
          const pixelImageData = this.imageElementToPixelImageData(img)
          resolve(pixelImageData)
        }
        catch (error) {
          reject(error)
        }
      })

      img.addEventListener('error', () => reject(new Error('Failed to load image')))
      img.src = url
    })
  }

  /**
   * Load image from File object
   */
  private async loadImageFromFile(file: File): Promise<PixelImageData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.addEventListener('load', async (e) => {
        try {
          const imageData = await this.loadImageFromUrl(e.target?.result as string)
          resolve(imageData)
        }
        catch (error) {
          reject(error)
        }
      })

      reader.addEventListener('error', () => reject(new Error('Failed to read file')))
      reader.readAsDataURL(file)
    })
  }

  /**
   * Convert HTMLImageElement to PixelImageData
   */
  private imageElementToPixelImageData(img: HTMLImageElement): PixelImageData {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }

    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, img.width, img.height)

    return PixelImageData.fromCanvasImageData(imageData)
  }

  /**
   * Preprocess image to handle large images
   */
  private preprocessImage(imageData: PixelImageData): PixelImageData {
    const maxPixels = 2_000_000 // 2MP limit to avoid memory issues
    const currentPixels = imageData.width * imageData.height

    if (currentPixels <= maxPixels) {
      return imageData
    }

    // Calculate new dimensions maintaining aspect ratio
    const scale = Math.sqrt(maxPixels / currentPixels)
    const newWidth = Math.floor(imageData.width * scale)
    const newHeight = Math.floor(imageData.height * scale)

    console.log(`Large image detected (${imageData.width}x${imageData.height}), resizing to ${newWidth}x${newHeight}`)

    return resizeImageSync(imageData, newWidth, newHeight, 'bilinear')
  }

  /**
   * Apply target size resize (matching Python pixelize.py logic) with smart optimization
   */
  private applyTargetSizeResize(imageData: PixelImageData): PixelImageData {
    const { width: w, height: h } = imageData
    const ratio = w / h
    const targetSize = this.options.targetSize || 256
    const patchSize = this.options.pixelSize

    // Calculate target_org_size and target_org_hw (matching Python logic)
    // target_org_size = (target_size**2 * patch_size**2 / ratio) ** 0.5
    const targetOrgSize = Math.sqrt((targetSize * targetSize * patchSize * patchSize) / ratio)
    const targetOrgHW: [number, number] = [
      Math.floor(targetOrgSize * ratio), // width
      Math.floor(targetOrgSize), // height
    ]

    console.log(`Target size calculation: targetSize=${targetSize}, patchSize=${patchSize}, ratio=${ratio}`)
    console.log(`targetOrgSize=${targetOrgSize}, targetOrgHW=[${targetOrgHW[0]}, ${targetOrgHW[1]}]`)

    // Respect noUp/noDown flags while keeping aspect ratio
    const desiredScale = Math.min(targetOrgHW[0] / w, targetOrgHW[1] / h)

    if (this.options.noDownscale && desiredScale < 1) {
      console.log('⏭️ [PixelOE] Skip target resize: noDownscale enabled')
      return imageData
    }

    const cappedScale = this.options.noUpscale ? Math.min(desiredScale, 1) : desiredScale
    if (cappedScale >= 1 && this.options.noUpscale) {
      console.log('⏭️ [PixelOE] Skip target resize: noUpscale enabled and target is larger')
      return imageData
    }

    const finalWidth = Math.max(1, Math.floor(w * cappedScale))
    const finalHeight = Math.max(1, Math.floor(h * cappedScale))

    if (finalWidth === w && finalHeight === h) {
      return imageData
    }

    // Resize image to the computed dimensions (using Canvas for synchronous path)
    return resizeImageSync(imageData, finalWidth, finalHeight, 'bilinear')
  }

  /**
   * Preprocess + target-size resize, shared by sync and async pipelines.
   */
  private prepareForOutline(imageData: PixelImageData): PixelImageData {
    const preprocessStart = performance.now()
    let processedImageData = this.preprocessImage(imageData)
    const preprocessTime = performance.now() - preprocessStart
    console.log(`📦 [PixelOE] Preprocessing: ${preprocessTime.toFixed(1)}ms`)

    const targetResizeStart = performance.now()
    processedImageData = this.applyTargetSizeResize(processedImageData)
    const targetResizeTime = performance.now() - targetResizeStart
    console.log(`🎯 [PixelOE] Target size resize: ${targetResizeTime.toFixed(1)}ms`)

    return processedImageData
  }

  /**
   * Main pixelize processing function
   */
  pixelize(imageData: PixelImageData, returnIntermediate: boolean = false): PixelOEResult {
    const totalStart = performance.now()
    console.log(`🎨 [PixelOE] Starting pixelize process for ${imageData.width}x${imageData.height} image`)

    const processedImageData = this.prepareForOutline(imageData)
    const originalImageData = processedImageData.clone()
    let result = processedImageData
    let expansionWeights: Float32Array | undefined

    // Step 1: Outline expansion (before sharpening, matching Python)
    const outlineStart = performance.now()
    if (this.options.thickness > 0) {
      const edgeMode = this.options.edgeExpansionMode || 'optimized'
      console.log(`🎯 [PixelOE] Using edge expansion mode: ${edgeMode}`)

      const expansion = edgeMode === 'optimized' && this.options.useEdgeOptimization
        ? outlineExpansionOptimized(
            result,
            this.options.thickness,
            this.options.thickness,
            this.options.pixelSize,
            9, // avgScale
            4, // distScale
            this.options.edgeDetectionThreshold || 0.1,
            true, // useOptimization
            returnIntermediate, // computeReturnWeights
          )
        : outlineExpansion(
            result,
            this.options.thickness,
            this.options.thickness,
            this.options.pixelSize,
            9,
            4,
          )
      result = expansion.result
      expansionWeights = expansion.weights
    }
    const outlineTime = performance.now() - outlineStart
    console.log(`📜 [PixelOE] Outline expansion (${this.options.edgeExpansionMode}): ${outlineTime.toFixed(1)}ms`)

    result = this.finishPipeline(result, originalImageData)

    const totalTime = performance.now() - totalStart
    console.log(`✅ [PixelOE] Total processing time: ${totalTime.toFixed(1)}ms`)
    console.log(`🏁 [PixelOE] Final result: ${result.width}x${result.height}`)

    return {
      result,
      intermediate: returnIntermediate ? originalImageData : undefined,
      weights: returnIntermediate ? expansionWeights : undefined,
    }
  }

  /**
   * Async pixelize: same output as {@link pixelize}, but the outline
   * morphology runs on a Web Worker pool when available (multi-core),
   * keeping the main thread responsive. Falls back to the synchronous
   * path in environments without Workers.
   */
  async pixelizeAsync(imageData: PixelImageData, returnIntermediate: boolean = false): Promise<PixelOEResult> {
    const totalStart = performance.now()
    console.log(`🎨 [PixelOE] Starting async pixelize process for ${imageData.width}x${imageData.height} image`)

    const processedImageData = this.prepareForOutline(imageData)
    const originalImageData = processedImageData.clone()
    let result = processedImageData
    let expansionWeights: Float32Array | undefined

    const outlineStart = performance.now()
    if (this.options.thickness > 0) {
      const edgeMode = this.options.edgeExpansionMode || 'optimized'

      if (edgeMode === 'optimized' && this.options.useEdgeOptimization) {
        const expansion = await outlineExpansionOptimizedAsync(
          result,
          this.options.thickness,
          this.options.thickness,
          this.options.pixelSize,
          9,
          4,
          this.options.edgeDetectionThreshold || 0.1,
          true,
          returnIntermediate,
        )
        result = expansion.result
        expansionWeights = expansion.weights
      }
      else {
        const expansion = outlineExpansion(
          result,
          this.options.thickness,
          this.options.thickness,
          this.options.pixelSize,
          9,
          4,
        )
        result = expansion.result
        expansionWeights = expansion.weights
      }
    }
    const outlineTime = performance.now() - outlineStart
    console.log(`📜 [PixelOE] Outline expansion (parallel): ${outlineTime.toFixed(1)}ms`)

    result = this.finishPipeline(result, originalImageData)

    const totalTime = performance.now() - totalStart
    console.log(`✅ [PixelOE] Total processing time: ${totalTime.toFixed(1)}ms`)

    return {
      result,
      intermediate: returnIntermediate ? originalImageData : undefined,
      weights: returnIntermediate ? expansionWeights : undefined,
    }
  }

  /**
   * Pipeline steps after outline expansion (shared by sync/async paths).
   */
  private finishPipeline(input: PixelImageData, originalImageData: PixelImageData): PixelImageData {
    let result = input

    // Step 2: Optional sharpening (after outline expansion, matching Python)
    const sharpenStart = performance.now()
    if (this.options.sharpenMode && this.options.sharpenMode !== 'none') {
      result = applySharpen(result, this.options.sharpenMode, this.options.sharpenStrength || 1)
    }
    const sharpenTime = performance.now() - sharpenStart
    console.log(`✨ [PixelOE] Sharpening: ${sharpenTime.toFixed(1)}ms`)

    // Step 3: First color matching (using optimized version)
    const colorMatchStart = performance.now()
    if (this.options.colorMatching) {
      result = matchColorFast(result, originalImageData)
    }
    const colorMatchTime = performance.now() - colorMatchStart
    console.log(`🎨 [PixelOE] First color matching: ${colorMatchTime.toFixed(1)}ms`)

    // Step 4: Downscaling
    const downscaleStart = performance.now()
    if (!this.options.noDownscale) {
      // Use targetSize parameter if provided, otherwise calculate from pixelSize (backward compatibility)
      const targetSize = this.options.targetSize
        || Math.floor(Math.sqrt(originalImageData.width * originalImageData.height) / this.options.pixelSize)

      console.log(`🔽 [PixelOE] Starting ${this.options.downscaleMethod ?? 'contrast'} downscaling (target: ${targetSize})`)
      if (this.options.downscaleMethod === 'mrf' || this.options.downscaleMethod === 'mrf-rescue') {
        result = contrastDownscaleMRF(result, targetSize, { aa: this.options.mrfAA, rescue: this.options.downscaleMethod === 'mrf-rescue' })
      }
      else if (this.options.downscaleMethod === 'contour') {
        result = contourDownscale(result, targetSize)
      }
      else {
        result = contrastDownscale(result, targetSize)
      }
    }
    const downscaleTime = performance.now() - downscaleStart
    console.log(`🔽 [PixelOE] Downscaling completed: ${downscaleTime.toFixed(1)}ms`)

    // Step 5: Color quantization and dithering (with palette support)
    const quantizationStart = performance.now()
    const preQuantResult = result // Store for second color matching

    if (this.options.usePalette && this.options.selectedPalette) {
      // Use predefined palette
      result = quantizeToPalette(
        result,
        this.options.selectedPalette,
        this.options.ditherMethod || 'none',
      )
      console.log(`🎨 [PixelOE] Applied palette: ${this.options.selectedPalette.name} (${this.options.selectedPalette.colors.length} colors)`)
    }
    else if (this.options.doQuantization) {
      // Use K-means quantization
      result = quantizeAndDither(
        result,
        this.options.numColors || 32,
        this.options.ditherMethod || 'none',
      )
    }

    // Second color matching after quantization (key difference from original)
    if ((this.options.usePalette || this.options.doQuantization) && this.options.colorMatching) {
      result = matchColorFast(result, preQuantResult)
    }

    const quantizationTime = performance.now() - quantizationStart
    console.log(`🌈 [PixelOE] Color quantization: ${quantizationTime.toFixed(1)}ms`)

    // Step 6: Color styling
    const stylingingStart = performance.now()
    if (this.options.contrast !== 1 || this.options.saturation !== 1) {
      result = colorStyling(result, this.options.saturation, this.options.contrast)
    }
    const stylingTime = performance.now() - stylingingStart
    console.log(`🎨 [PixelOE] Color styling: ${stylingTime.toFixed(1)}ms`)

    // Step 7: Upscaling (unless disabled)
    const upscaleStart = performance.now()
    const shouldUpscale = !this.options.noUpscale && !this.options.noPostUpscale
    if (shouldUpscale) {
      result = resizeImageSync(result, result.width * this.options.pixelSize, result.height * this.options.pixelSize, 'nearest')
    }
    const upscaleTime = performance.now() - upscaleStart
    console.log(`⬆️ [PixelOE] Upscaling: ${upscaleTime.toFixed(1)}ms`)

    return result
  }

  /**
   * Convert PixelImageData to Canvas element
   */
  toCanvas(pixelImageData: PixelImageData): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = pixelImageData.width
    canvas.height = pixelImageData.height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }

    const imageData = pixelImageData.toCanvasImageData()
    ctx.putImageData(imageData, 0, 0)

    return canvas
  }

  /**
   * Export image as blob
   */
  async exportBlob(pixelImageData: PixelImageData, mimeType: string = 'image/png'): Promise<Blob> {
    const canvas = this.toCanvas(pixelImageData)

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        }
        else {
          reject(new Error('Failed to create blob'))
        }
      }, mimeType)
    })
  }

  /**
   * Simple weighted blend for ultra-fast mode
   */
  // Simple weighted blend function removed as no longer needed
}
