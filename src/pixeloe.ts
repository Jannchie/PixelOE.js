import { PixelImageData } from './core/imageData';
import { outlineExpansion } from './core/outline';
import { matchColor, colorStyling } from './core/color';
import { contrastDownscale, nearestUpscale, centerDownscale, kCentroidDownscale } from './core/downscale';
import { quantizeAndDither } from './core/quantization';
import { applySharpen, type SharpenMode } from './core/sharpen';
import { highQualityResize } from './core/resample';
import { type DitherMethod } from './core/dithering';

/**
 * PixelOE configuration options
 */
export interface PixelOEOptions {
  pixelSize: number;        // patch_size in Python demo
  thickness: number;        // thickness in Python demo  
  targetSize?: number;      // target_size in Python demo (new parameter)
  mode: 'contrast' | 'center' | 'nearest' | 'bilinear' | 'k-centroid' | 'lanczos';
  colorMatching: boolean;
  contrast: number;
  saturation: number;
  noUpscale: boolean;
  noDownscale: boolean;
  kCentroids?: number; // Number of centroids for k-centroid mode
  
  // New options from Python version
  sharpenMode?: SharpenMode; // Sharpening algorithm
  sharpenStrength?: number; // Sharpening strength
  doQuantization?: boolean; // Enable color quantization
  numColors?: number; // Number of colors for quantization
  ditherMethod?: DitherMethod; // Dithering method
  quantMode?: 'kmeans'; // Quantization algorithm (for future extensibility)
  noPostUpscale?: boolean; // Skip final upscaling
  resampleMethod?: 'lanczos' | 'bicubic' | 'auto'; // High-quality resampling method
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
      pixelSize: 6,            // patch_size (demo default)
      thickness: 3,            // thickness (demo uses 1-2, but keep 3 as default)
      targetSize: 256,         // target_size (matching demo default)
      mode: 'contrast',
      colorMatching: true,
      contrast: 1.0,
      saturation: 1.0,
      noUpscale: false,
      noDownscale: false,
      kCentroids: 2,
      
      // New default options
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
   * Apply target size resize (matching Python pixelize.py logic)
   */
  private applyTargetSizeResize(imageData: PixelImageData): PixelImageData {
    const { width: w, height: h } = imageData;
    const ratio = w / h;
    const targetSize = this.options.targetSize || 256;
    const patchSize = this.options.pixelSize;
    
    // Calculate target_org_size and target_org_hw (matching Python logic)
    // target_org_size = (target_size**2 * patch_size**2 / ratio) ** 0.5
    const targetOrgSize = Math.sqrt((targetSize * targetSize * patchSize * patchSize) / ratio);
    const targetOrgHW: [number, number] = [
      Math.floor(targetOrgSize * ratio), // width
      Math.floor(targetOrgSize)         // height
    ];
    
    console.log(`Target size calculation: targetSize=${targetSize}, patchSize=${patchSize}, ratio=${ratio}`);
    console.log(`targetOrgSize=${targetOrgSize}, targetOrgHW=[${targetOrgHW[0]}, ${targetOrgHW[1]}]`);
    
    // Resize image to target_org_hw (matching Python: img = cv2.resize(img, target_org_hw))
    return this.resizeBilinear(imageData, targetOrgHW[0], targetOrgHW[1]);
  }

  /**
   * Add padding to ensure image dimensions are compatible with pixel size (matching Python)
   */
  private addPadding(imageData: PixelImageData, pixelSize: number): PixelImageData {
    const { width: w, height: h } = imageData;
    
    const padH = pixelSize - (h % pixelSize);
    const padW = pixelSize - (w % pixelSize);
    
    // No padding needed if already divisible
    if (padH === pixelSize && padW === pixelSize) {
      return imageData;
    }
    
    // Calculate padding distribution (matching Python pad behavior)
    const padTop = Math.floor(padH / 2);
    const padBottom = padH - padTop;
    const padLeft = Math.floor(padW / 2);
    const padRight = padW - padLeft;
    
    const paddedWidth = w + padLeft + padRight;
    const paddedHeight = h + padTop + padBottom;
    
    const paddedImage = new PixelImageData(paddedWidth, paddedHeight);
    
    // Fill with replicated edge pixels (matching Python "replicate" mode)
    for (let y = 0; y < paddedHeight; y++) {
      for (let x = 0; x < paddedWidth; x++) {
        let srcX = x - padLeft;
        let srcY = y - padTop;
        
        // Clamp to edge pixels for padding
        srcX = Math.max(0, Math.min(srcX, w - 1));
        srcY = Math.max(0, Math.min(srcY, h - 1));
        
        const pixel = imageData.getPixel(srcX, srcY);
        paddedImage.setPixel(x, y, pixel);
      }
    }
    
    return paddedImage;
  }

  /**
   * Main pixelize processing function
   */
  pixelize(imageData: PixelImageData, returnIntermediate: boolean = false): PixelOEResult {
    // Preprocess large images to avoid memory issues
    let processedImageData = this.preprocessImage(imageData);
    
    // Apply Python-style target size calculation and resize (matching pixelize.py)
    processedImageData = this.applyTargetSizeResize(processedImageData);
    
    // Skip padding for now to maintain original behavior
    // processedImageData = this.addPadding(processedImageData, this.options.pixelSize);
    
    const originalImageData = processedImageData.clone();
    let result = processedImageData.clone();
    let expansionWeights: Float32Array | undefined;

    // Step 1: Outline expansion (before sharpening, matching Python)
    if (this.options.thickness > 0) {
      const expansion = outlineExpansion(
        result,
        this.options.thickness,
        this.options.thickness,
        this.options.pixelSize, // patchSize (matching Python: patch_size)
        9, // avgScale (matching Python: 9)
        4  // distScale (matching Python: 4)
      );
      result = expansion.result;
      expansionWeights = expansion.weights;
    }

    // Step 2: Optional sharpening (after outline expansion, matching Python)
    if (this.options.sharpenMode && this.options.sharpenMode !== 'none') {
      result = applySharpen(result, this.options.sharpenMode, this.options.sharpenStrength || 1.0);
    }

    // Step 3: First color matching
    if (this.options.colorMatching) {
      result = matchColor(result, originalImageData);
    }

    // Step 4: Downscaling
    if (!this.options.noDownscale) {
      // Use targetSize parameter if provided, otherwise calculate from pixelSize (backward compatibility)
      const targetSize = this.options.targetSize || 
        Math.floor(Math.sqrt(processedImageData.width * processedImageData.height) / this.options.pixelSize);
      
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
        case 'lanczos':
          const ratioL = imageData.width / imageData.height;
          const targetHeightL = Math.floor(Math.sqrt(targetSize * targetSize / ratioL));
          const targetWidthL = Math.floor(targetHeightL * ratioL);
          result = highQualityResize(result, targetWidthL, targetHeightL, this.options.resampleMethod);
          break;
        case 'k-centroid':
          result = kCentroidDownscale(result, targetSize, this.options.kCentroids || 2);
          break;
        default:
          result = contrastDownscale(result, this.options.pixelSize);
      }
    }

    // Step 5: Color quantization and dithering (simplified)
    let preQuantResult = result; // Store for second color matching
    if (this.options.doQuantization) {
      result = quantizeAndDither(
        result,
        this.options.numColors || 32,
        this.options.ditherMethod || 'none'
      );
      
      // Second color matching after quantization (key difference from original)
      if (this.options.colorMatching) {
        result = matchColor(result, preQuantResult);
      }
    }

    // Step 6: Color styling
    if (this.options.contrast !== 1.0 || this.options.saturation !== 1.0) {
      result = colorStyling(result, this.options.saturation, this.options.contrast);
    }

    // Step 7: Upscaling (unless disabled)
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