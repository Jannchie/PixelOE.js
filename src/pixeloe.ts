import { PixelImageData } from './core/imageData';
import { outlineExpansion } from './core/outline';
import { matchColor, colorStyling } from './core/color';
import { contrastDownscale, nearestUpscale, centerDownscale, kCentroidDownscale } from './core/downscale';

/**
 * PixelOE configuration options
 */
export interface PixelOEOptions {
  pixelSize: number;
  thickness: number;
  mode: 'contrast' | 'center' | 'nearest' | 'bilinear' | 'k-centroid';
  colorMatching: boolean;
  contrast: number;
  saturation: number;
  noUpscale: boolean;
  noDownscale: boolean;
  kCentroids?: number; // Number of centroids for k-centroid mode
}

/**
 * PixelOE processing result
 */
export interface PixelOEResult {
  result: PixelImageData;
  intermediate?: PixelImageData;
  weights?: Float32Array;
}

/**
 * Main PixelOE class for pixel art generation
 */
export class PixelOE {
  private options: PixelOEOptions;

  constructor(options: Partial<PixelOEOptions> = {}) {
    this.options = {
      pixelSize: 6,
      thickness: 3,
      mode: 'contrast',
      colorMatching: true,
      contrast: 1.0,
      saturation: 1.0,
      noUpscale: false,
      noDownscale: false,
      kCentroids: 2,
      ...options
    };
  }

  /**
   * Update options
   */
  setOptions(options: Partial<PixelOEOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): PixelOEOptions {
    return { ...this.options };
  }

  /**
   * Load image from various sources
   */
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

  /**
   * Load image from URL
   */
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

  /**
   * Load image from File object
   */
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

  /**
   * Convert HTMLImageElement to PixelImageData
   */
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

  /**
   * Preprocess image to handle large images
   */
  private preprocessImage(imageData: PixelImageData): PixelImageData {
    const maxPixels = 2000000; // 2MP limit to avoid memory issues
    const currentPixels = imageData.width * imageData.height;
    
    if (currentPixels <= maxPixels) {
      return imageData;
    }
    
    // Calculate new dimensions maintaining aspect ratio
    const scale = Math.sqrt(maxPixels / currentPixels);
    const newWidth = Math.floor(imageData.width * scale);
    const newHeight = Math.floor(imageData.height * scale);
    
    console.log(`Large image detected (${imageData.width}x${imageData.height}), resizing to ${newWidth}x${newHeight}`);
    
    return this.resizeBilinear(imageData, newWidth, newHeight);
  }

  /**
   * Main pixelize processing function
   */
  pixelize(imageData: PixelImageData, returnIntermediate: boolean = false): PixelOEResult {
    // Preprocess large images to avoid memory issues
    let processedImageData = this.preprocessImage(imageData);
    
    const originalImageData = processedImageData.clone();
    let result = processedImageData.clone();
    let expansionWeights: Float32Array | undefined;

    // Calculate target size
    const totalPixels = processedImageData.width * processedImageData.height;
    const targetSize = Math.floor(Math.sqrt(totalPixels) / this.options.pixelSize);

    // Step 1: Outline expansion
    if (this.options.thickness > 0) {
      const expansion = outlineExpansion(
        result,
        this.options.thickness,
        this.options.thickness,
        16, // patchSize
        10, // avgScale
        3   // distScale
      );
      result = expansion.result;
      expansionWeights = expansion.weights;
    }

    // Step 2: Color matching
    if (this.options.colorMatching) {
      result = matchColor(result, originalImageData);
    }

    // Step 3: Downscaling
    if (!this.options.noDownscale) {
      switch (this.options.mode) {
        case 'contrast':
          result = contrastDownscale(result, targetSize);
          break;
        case 'center':
          result = centerDownscale(result, targetSize);
          break;
        case 'nearest':
          // For nearest, we'll use a simple resize
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
        case 'k-centroid':
          result = kCentroidDownscale(result, targetSize, this.options.kCentroids || 2);
          break;
        default:
          result = contrastDownscale(result, targetSize);
      }
    }

    // Step 4: Color styling
    if (this.options.contrast !== 1.0 || this.options.saturation !== 1.0) {
      result = colorStyling(result, this.options.saturation, this.options.contrast);
    }

    // Step 5: Upscaling
    if (!this.options.noUpscale) {
      result = nearestUpscale(result, this.options.pixelSize);
    }

    return {
      result,
      intermediate: returnIntermediate ? originalImageData : undefined,
      weights: returnIntermediate ? expansionWeights : undefined
    };
  }

  /**
   * Simple nearest neighbor resize
   */
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

  /**
   * Simple bilinear resize
   */
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
   * Convert PixelImageData to Canvas element
   */
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

  /**
   * Export image as blob
   */
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