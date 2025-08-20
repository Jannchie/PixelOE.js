import { PixelImageData } from './core/imageData';
import { outlineExpansion } from './core/outline';
import { matchColor, colorStyling } from './core/color';
import { contrastDownscale, nearestUpscale, centerDownscale, kCentroidDownscale } from './core/downscale';
import { kCentroidDownscaleOptimized } from './core/downscaleOptimized';
import { fastKCentroidDownscale, fastContrastDownscale } from './core/downscaleSimpleOptimized';
import { quantizeAndDitherOptimized } from './core/quantizationOptimized';
import { applySharpen } from './core/sharpen';
import { highQualityResize } from './core/resample';
import { type PixelOEOptions, type PixelOEResult } from './pixeloe';

/**
 * Optimized PixelOE class using optimized algorithms
 */
export class PixelOEOptimized {
  private options: PixelOEOptions;

  constructor(options: Partial<PixelOEOptions> = {}) {
    this.options = {
      pixelSize: 6,
      thickness: 3,
      targetSize: 256,
      mode: 'contrast',
      colorMatching: true,
      contrast: 1.0,
      saturation: 1.0,
      noUpscale: false,
      noDownscale: false,
      kCentroids: 2,
      sharpenMode: 'none',
      sharpenStrength: 1.0,
      doQuantization: false,
      numColors: 32,
      ditherMethod: 'none',
      quantMode: 'kmeans',
      noPostUpscale: false,
      resampleMethod: 'auto',
      ...options
    };
  }

  setOptions(options: Partial<PixelOEOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): PixelOEOptions {
    return { ...this.options };
  }

  async loadImage(source: string | HTMLImageElement | File | PixelImageData): Promise<PixelImageData> {
    if (source instanceof PixelImageData) {
      return source;
    }

    if (typeof source === 'string') {
      return this.loadImageFromUrl(source);
    }

    if (source instanceof HTMLImageElement) {
      return this.imageElementToPixelImageData(source);
    }

    if (source instanceof File) {
      return this.loadImageFromFile(source);
    }

    throw new Error('Unsupported image source type');
  }

  private async loadImageFromUrl(url: string): Promise<PixelImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const pixelImageData = this.imageElementToPixelImageData(img);
          resolve(pixelImageData);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  private async loadImageFromFile(file: File): Promise<PixelImageData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const imageData = await this.loadImageFromUrl(e.target?.result as string);
          resolve(imageData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  private imageElementToPixelImageData(img: HTMLImageElement): PixelImageData {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    
    return PixelImageData.fromCanvasImageData(imageData);
  }

  private preprocessImage(imageData: PixelImageData): PixelImageData {
    const maxPixels = 2000000;
    const currentPixels = imageData.width * imageData.height;
    
    if (currentPixels <= maxPixels) {
      return imageData;
    }
    
    const scale = Math.sqrt(maxPixels / currentPixels);
    const newWidth = Math.floor(imageData.width * scale);
    const newHeight = Math.floor(imageData.height * scale);
    
    return this.resizeBilinear(imageData, newWidth, newHeight);
  }

  private applyTargetSizeResize(imageData: PixelImageData): PixelImageData {
    const { width: w, height: h } = imageData;
    const ratio = w / h;
    const targetSize = this.options.targetSize || 256;
    const patchSize = this.options.pixelSize;
    
    const targetOrgSize = Math.sqrt((targetSize * targetSize * patchSize * patchSize) / ratio);
    const targetOrgHW: [number, number] = [
      Math.floor(targetOrgSize * ratio),
      Math.floor(targetOrgSize)
    ];
    
    return this.resizeBilinear(imageData, targetOrgHW[0], targetOrgHW[1]);
  }

  /**
   * Optimized pixelize processing function using optimized algorithms
   */
  pixelize(imageData: PixelImageData, returnIntermediate: boolean = false): PixelOEResult {
    let processedImageData = this.preprocessImage(imageData);
    processedImageData = this.applyTargetSizeResize(processedImageData);
    
    const originalImageData = processedImageData.clone();
    let result = processedImageData.clone();
    let expansionWeights: Float32Array | undefined;

    // Step 1: Outline expansion
    if (this.options.thickness > 0) {
      const expansion = outlineExpansion(
        result,
        this.options.thickness,
        this.options.thickness,
        this.options.pixelSize,
        9,
        4
      );
      result = expansion.result;
      expansionWeights = expansion.weights;
    }

    // Step 2: Optional sharpening
    if (this.options.sharpenMode && this.options.sharpenMode !== 'none') {
      result = applySharpen(result, this.options.sharpenMode, this.options.sharpenStrength || 1.0);
    }

    // Step 3: First color matching
    if (this.options.colorMatching) {
      result = matchColor(result, originalImageData);
    }

    // Step 4: Downscaling (using optimized versions)
    if (!this.options.noDownscale) {
      const targetSize = this.options.targetSize || 
        Math.floor(Math.sqrt(processedImageData.width * processedImageData.height) / this.options.pixelSize);
      
      switch (this.options.mode) {
        case 'contrast':
          // Use fast optimized version for contrast downscaling
          result = fastContrastDownscale(result, targetSize);
          break;
        case 'center':
          result = centerDownscale(result, targetSize);
          break;
        case 'nearest':
          const ratio = imageData.width / imageData.height;
          const targetHeight = Math.floor(Math.sqrt(targetSize * targetSize / ratio));
          const targetWidth = Math.floor(targetHeight * ratio);
          result = this.resizeNearest(result, targetWidth, targetHeight);
          break;
        case 'bilinear':
          const ratioB = imageData.width / imageData.height;
          const targetHeightB = Math.floor(Math.sqrt(targetSize * targetSize / ratioB));
          const targetWidthB = Math.floor(targetHeightB * ratioB);
          result = this.resizeBilinear(result, targetWidthB, targetHeightB);
          break;
        case 'lanczos':
          const ratioL = imageData.width / imageData.height;
          const targetHeightL = Math.floor(Math.sqrt(targetSize * targetSize / ratioL));
          const targetWidthL = Math.floor(targetHeightL * ratioL);
          result = highQualityResize(result, targetWidthL, targetHeightL, this.options.resampleMethod);
          break;
        case 'k-centroid':
          // Use the fast optimized version that adapts to image size
          result = fastKCentroidDownscale(result, targetSize, this.options.kCentroids || 2);
          break;
        default:
          result = contrastDownscale(result, this.options.pixelSize);
      }
    }

    // Step 5: Color quantization and dithering (adaptive optimization)
    let preQuantResult = result;
    if (this.options.doQuantization) {
      const totalPixels = result.width * result.height;
      
      // For very large images, skip intensive quantization to avoid slowdown
      if (totalPixels > 150000) { // ~387x387 pixels
        // Use simple color reduction instead of complex K-means
        // This is much faster for large images
        result = this.simpleColorReduction(result, this.options.numColors || 32);
      } else {
        result = quantizeAndDitherOptimized(
          result,
          this.options.numColors || 32,
          this.options.ditherMethod || 'none'
        );
      }
      
      if (this.options.colorMatching) {
        result = matchColor(result, preQuantResult);
      }
    }

    // Step 6: Color styling
    if (this.options.contrast !== 1.0 || this.options.saturation !== 1.0) {
      result = colorStyling(result, this.options.saturation, this.options.contrast);
    }

    // Step 7: Upscaling
    const shouldUpscale = !this.options.noUpscale && !this.options.noPostUpscale;
    if (shouldUpscale) {
      result = nearestUpscale(result, this.options.pixelSize);
    }

    return {
      result,
      intermediate: returnIntermediate ? originalImageData : undefined,
      weights: returnIntermediate ? expansionWeights : undefined
    };
  }

  private resizeNearest(imageData: PixelImageData, newWidth: number, newHeight: number): PixelImageData {
    const result = new PixelImageData(newWidth, newHeight);
    const scaleX = imageData.width / newWidth;
    const scaleY = imageData.height / newHeight;

    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcX = Math.floor(x * scaleX);
        const srcY = Math.floor(y * scaleY);
        const pixel = imageData.getPixel(srcX, srcY);
        result.setPixel(x, y, pixel);
      }
    }

    return result;
  }

  private resizeBilinear(imageData: PixelImageData, newWidth: number, newHeight: number): PixelImageData {
    const result = new PixelImageData(newWidth, newHeight);
    const scaleX = imageData.width / newWidth;
    const scaleY = imageData.height / newHeight;

    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcX = x * scaleX;
        const srcY = y * scaleY;

        const x1 = Math.floor(srcX);
        const y1 = Math.floor(srcY);
        const x2 = Math.min(x1 + 1, imageData.width - 1);
        const y2 = Math.min(y1 + 1, imageData.height - 1);

        const dx = srcX - x1;
        const dy = srcY - y1;

        const [r1, g1, b1, a1] = imageData.getPixel(x1, y1);
        const [r2, g2, b2, a2] = imageData.getPixel(x2, y1);
        const [r3, g3, b3, a3] = imageData.getPixel(x1, y2);
        const [r4, g4, b4, a4] = imageData.getPixel(x2, y2);

        const r = Math.round(
          r1 * (1 - dx) * (1 - dy) +
          r2 * dx * (1 - dy) +
          r3 * (1 - dx) * dy +
          r4 * dx * dy
        );

        const g = Math.round(
          g1 * (1 - dx) * (1 - dy) +
          g2 * dx * (1 - dy) +
          g3 * (1 - dx) * dy +
          g4 * dx * dy
        );

        const b = Math.round(
          b1 * (1 - dx) * (1 - dy) +
          b2 * dx * (1 - dy) +
          b3 * (1 - dx) * dy +
          b4 * dx * dy
        );

        const a = Math.round(
          a1 * (1 - dx) * (1 - dy) +
          a2 * dx * (1 - dy) +
          a3 * (1 - dx) * dy +
          a4 * dx * dy
        );

        result.setPixel(x, y, [r, g, b, a]);
      }
    }

    return result;
  }

  /**
   * Simple and fast color reduction for large images
   */
  private simpleColorReduction(imageData: PixelImageData, numColors: number): PixelImageData {
    const result = imageData.clone();
    const factor = Math.floor(256 / numColors);
    
    for (let y = 0; y < imageData.height; y++) {
      for (let x = 0; x < imageData.width; x++) {
        const [r, g, b, a] = imageData.getPixel(x, y);
        
        // Simple quantization by reducing color levels
        const newR = Math.floor(r / factor) * factor;
        const newG = Math.floor(g / factor) * factor;
        const newB = Math.floor(b / factor) * factor;
        
        result.setPixel(x, y, [newR, newG, newB, a]);
      }
    }
    
    return result;
  }

  toCanvas(pixelImageData: PixelImageData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = pixelImageData.width;
    canvas.height = pixelImageData.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    const imageData = pixelImageData.toCanvasImageData();
    ctx.putImageData(imageData, 0, 0);
    
    return canvas;
  }

  async exportBlob(pixelImageData: PixelImageData, mimeType: string = 'image/png'): Promise<Blob> {
    const canvas = this.toCanvas(pixelImageData);
    
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, mimeType);
    });
  }
}