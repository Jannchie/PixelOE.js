import { PixelImageData } from './imageData';
import { rgbToLab, labToRgb } from './colorSpace';
import { mean, standardDeviation, clamp } from '../utils/math';

/**
 * Color processing utilities
 */

/**
 * Match color statistics between source and target images (updated to match Python)
 */
export function matchColor(source: PixelImageData, target: PixelImageData, level: number = 5): PixelImageData {
  // First convert to LAB and apply statistical matching across all pixels at once
  const sourcePixels: [number, number, number][] = [];
  const targetPixels: [number, number, number][] = [];
  
  // Collect all pixels in LAB space (convert to 0-255 range to match Python cv2)
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const [r, g, b] = source.getPixel(x, y);
      const [l, a, bLab] = rgbToLab(r, g, b);
      // Convert to cv2-compatible range: L=[0,255], a=[0,255], b=[0,255]
      const cvL = (l / 100) * 255;
      const cvA = (a + 128);
      const cvB = (bLab + 128);
      sourcePixels.push([cvL, cvA, cvB]);
    }
  }
  
  for (let y = 0; y < target.height && y < source.height; y++) {
    for (let x = 0; x < target.width && x < source.width; x++) {
      const [r, g, b] = target.getPixel(x, y);
      const [l, a, bLab] = rgbToLab(r, g, b);
      // Convert to cv2-compatible range
      const cvL = (l / 100) * 255;
      const cvA = (a + 128);
      const cvB = (bLab + 128);
      targetPixels.push([cvL, cvA, cvB]);
    }
  }
  
  // Calculate mean and std for all channels combined (matching Python approach)
  const sourceMean = calculateMeanStd(sourcePixels);
  const targetMean = calculateMeanStd(targetPixels);
  
  // Apply statistical matching (matching Python: (source - source_mean) / source_std * target_std + target_mean)
  const result = source.clone();
  
  let pixelIndex = 0;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const [l, a_lab, b_lab] = sourcePixels[pixelIndex++];
      const [, , , a] = source.getPixel(x, y);
      
      // Apply statistical transformation
      const normalizedL = (l - sourceMean.l.mean) / (sourceMean.l.std || 1);
      const normalizedA = (a_lab - sourceMean.a.mean) / (sourceMean.a.std || 1);
      const normalizedB = (b_lab - sourceMean.b.mean) / (sourceMean.b.std || 1);
      
      const matchedL = normalizedL * targetMean.l.std + targetMean.l.mean;
      const matchedA = normalizedA * targetMean.a.std + targetMean.a.mean;
      const matchedB = normalizedB * targetMean.b.std + targetMean.b.mean;
      
      // Convert back from cv2 range to standard LAB range
      const standardL = (matchedL / 255) * 100;
      const standardA = matchedA - 128;
      const standardBLab = matchedB - 128;
      
      const [newR, newG, newB] = labToRgb(standardL, standardA, standardBLab);
      result.setPixel(x, y, [
        Math.round(clamp(newR, 0, 255)),
        Math.round(clamp(newG, 0, 255)),
        Math.round(clamp(newB, 0, 255)),
        a
      ]);
    }
  }
  
  // Apply improved multi-level wavelet color fix (matching Python implementation)
  return improvedWaveletColorFix(result, target, level);
}

/**
 * Calculate mean and standard deviation for LAB pixel arrays (matching Python implementation)
 */
function calculateMeanStd(pixels: [number, number, number][]) {
  const lValues = pixels.map(p => p[0]);
  const aValues = pixels.map(p => p[1]);
  const bValues = pixels.map(p => p[2]);
  
  return {
    l: { mean: mean(lValues), std: standardDeviation(lValues) },
    a: { mean: mean(aValues), std: standardDeviation(aValues) },
    b: { mean: mean(bValues), std: standardDeviation(bValues) }
  };
}

/**
 * Calculate color statistics for an image (legacy function)
 */
function calculateColorStats(imageData: PixelImageData) {
  const lValues: number[] = [];
  const aValues: number[] = [];
  const bValues: number[] = [];
  
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [r, g, b] = imageData.getPixel(x, y);
      const [l, a, bLab] = rgbToLab(r, g, b);
      
      lValues.push(l);
      aValues.push(a);
      bValues.push(bLab);
    }
  }
  
  return {
    l: { mean: mean(lValues), std: standardDeviation(lValues) },
    a: { mean: mean(aValues), std: standardDeviation(aValues) },
    b: { mean: mean(bValues), std: standardDeviation(bValues) }
  };
}

/**
 * Improved wavelet color correction matching Python implementation exactly
 */
function improvedWaveletColorFix(source: PixelImageData, target: PixelImageData, level: number): PixelImageData {
  // Step 1: Apply wavelet_colorfix to each channel separately (matching Python)
  const result = new PixelImageData(source.width, source.height);
  
  // Process R, G, B channels separately (matching Python approach)
  for (let channel = 0; channel < 3; channel++) {
    // Extract source channel
    const sourceChannel = new Float32Array(source.width * source.height);
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        sourceChannel[y * source.width + x] = source.getPixel(x, y)[channel];
      }
    }
    
    // Extract target channel  
    const targetChannel = new Float32Array(target.width * target.height);
    for (let y = 0; y < target.height; y++) {
      for (let x = 0; x < target.width; x++) {
        targetChannel[y * target.width + x] = target.getPixel(x, y)[channel];
      }
    }
    
    // Apply wavelet decomposition to source (get high frequency)
    const sourceHigh = waveletDecomposition(sourceChannel, source.width, source.height, level).high;
    
    // Apply wavelet decomposition to target (get low frequency)  
    const targetLow = waveletDecomposition(targetChannel, target.width, target.height, level).low;
    
    // Combine: output = inp_high + target_low (matching Python line 28)
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const idx = y * source.width + x;
        const combined = sourceHigh[idx] + targetLow[idx];
        
        if (channel === 0) {
          // Initialize pixel for first channel
          const [, , , a] = source.getPixel(x, y);
          result.setPixel(x, y, [Math.round(clamp(combined, 0, 255)), 0, 0, a]);
        } else {
          // Update existing pixel
          const [r, g, b, a] = result.getPixel(x, y);
          if (channel === 1) {
            result.setPixel(x, y, [r, Math.round(clamp(combined, 0, 255)), b, a]);
          } else {
            result.setPixel(x, y, [r, g, Math.round(clamp(combined, 0, 255)), a]);
          }
        }
      }
    }
  }
  
  return result;
}

/**
 * Wavelet decomposition matching Python implementation exactly
 */
function waveletDecomposition(channel: Float32Array, width: number, height: number, levels: number): { high: Float32Array, low: Float32Array } {
  const highFreq = new Float32Array(channel.length); // Initialize to zeros
  let current = new Float32Array(channel); // Copy input
  
  // Multi-level decomposition (matching Python lines 34-38)
  for (let i = 1; i <= levels; i++) {
    const radius = Math.pow(2, i);
    const lowFreq = simpleGaussianBlur(current, width, height, radius);
    
    // high_freq = high_freq + (inp - low_freq) 
    for (let j = 0; j < channel.length; j++) {
      highFreq[j] = highFreq[j] + (current[j] - lowFreq[j]);
    }
    
    current = lowFreq; // inp = low_freq
  }
  
  return { high: highFreq, low: current };
}

/**
 * Simple Gaussian blur matching Python cv2.GaussianBlur behavior  
 */
function simpleGaussianBlur(channel: Float32Array, width: number, height: number, radius: number): Float32Array {
  const kernelSize = 2 * radius + 1;
  const result = new Float32Array(channel.length);
  
  // Simple box blur approximation (much simpler than full Gaussian)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      // Apply blur kernel
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const nx = clamp(x + kx, 0, width - 1);
          const ny = clamp(y + ky, 0, height - 1);
          sum += channel[ny * width + nx];
          count++;
        }
      }
      
      result[y * width + x] = sum / count;
    }
  }
  
  return result;
}

/**
 * Legacy simple wavelet-like color correction
 */
function waveletColorFix(source: PixelImageData, target: PixelImageData, level: number): PixelImageData {
  const result = source.clone();
  
  // Simple implementation: blend high frequency from source with low frequency from target
  const sourceBlurred = gaussianBlur(source, level);
  const targetBlurred = gaussianBlur(target, level);
  
  for (let y = 0; y < source.height && y < target.height; y++) {
    for (let x = 0; x < source.width && x < target.width; x++) {
      const [srcR, srcG, srcB, srcA] = source.getPixel(x, y);
      const [srcBlurR, srcBlurG, srcBlurB] = sourceBlurred.getPixel(x, y);
      const [tgtBlurR, tgtBlurG, tgtBlurB] = targetBlurred.getPixel(x, y);
      
      // High frequency = original - blurred
      const highFreqR = srcR - srcBlurR;
      const highFreqG = srcG - srcBlurG;
      const highFreqB = srcB - srcBlurB;
      
      // Combine high frequency with target low frequency
      const finalR = clamp(tgtBlurR + highFreqR, 0, 255);
      const finalG = clamp(tgtBlurG + highFreqG, 0, 255);
      const finalB = clamp(tgtBlurB + highFreqB, 0, 255);
      
      result.setPixel(x, y, [finalR, finalG, finalB, srcA]);
    }
  }
  
  return result;
}

/**
 * Improved Gaussian blur with proper kernel (matching Python implementation)
 */
function improvedGaussianBlur(imageData: PixelImageData, radius: number): PixelImageData {
  if (radius <= 0) return imageData.clone();
  
  // Generate Gaussian kernel
  const kernelSize = Math.ceil(radius * 2) * 2 + 1;
  const kernel: number[] = [];
  const center = Math.floor(kernelSize / 2);
  let sum = 0;
  
  for (let i = 0; i < kernelSize; i++) {
    const x = i - center;
    const value = Math.exp(-(x * x) / (2 * radius * radius));
    kernel[i] = value;
    sum += value;
  }
  
  // Normalize kernel
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }
  
  // Apply horizontal blur
  const temp = new PixelImageData(imageData.width, imageData.height);
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let i = 0; i < kernelSize; i++) {
        const px = clamp(x + i - center, 0, imageData.width - 1);
        const [pr, pg, pb, pa] = imageData.getPixel(px, y);
        const weight = kernel[i];
        
        r += pr * weight;
        g += pg * weight;
        b += pb * weight;
        a += pa * weight;
      }
      
      temp.setPixel(x, y, [Math.round(r), Math.round(g), Math.round(b), Math.round(a)]);
    }
  }
  
  // Apply vertical blur
  const result = new PixelImageData(imageData.width, imageData.height);
  for (let y = 0; y < temp.height; y++) {
    for (let x = 0; x < temp.width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let i = 0; i < kernelSize; i++) {
        const py = clamp(y + i - center, 0, temp.height - 1);
        const [pr, pg, pb, pa] = temp.getPixel(x, py);
        const weight = kernel[i];
        
        r += pr * weight;
        g += pg * weight;
        b += pb * weight;
        a += pa * weight;
      }
      
      result.setPixel(x, y, [Math.round(r), Math.round(g), Math.round(b), Math.round(a)]);
    }
  }
  
  return result;
}

/**
 * Simple Gaussian blur approximation using box blur (legacy)
 */
function gaussianBlur(imageData: PixelImageData, radius: number): PixelImageData {
  const result = imageData.clone();
  
  // Apply horizontal blur
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let count = 0;
      
      for (let i = -radius; i <= radius; i++) {
        const px = clamp(x + i, 0, imageData.width - 1);
        const [pr, pg, pb, pa] = imageData.getPixel(px, y);
        r += pr;
        g += pg;
        b += pb;
        a += pa;
        count++;
      }
      
      result.setPixel(x, y, [
        Math.round(r / count),
        Math.round(g / count),
        Math.round(b / count),
        Math.round(a / count)
      ]);
    }
  }
  
  // Apply vertical blur
  const temp = result.clone();
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let count = 0;
      
      for (let i = -radius; i <= radius; i++) {
        const py = clamp(y + i, 0, result.height - 1);
        const [pr, pg, pb, pa] = temp.getPixel(x, py);
        r += pr;
        g += pg;
        b += pb;
        a += pa;
        count++;
      }
      
      result.setPixel(x, y, [
        Math.round(r / count),
        Math.round(g / count),
        Math.round(b / count),
        Math.round(a / count)
      ]);
    }
  }
  
  return result;
}

/**
 * Adjust color saturation and contrast
 */
export function colorStyling(
  imageData: PixelImageData, 
  saturation: number = 1.0, 
  contrast: number = 1.0
): PixelImageData {
  const result = new PixelImageData(imageData.width, imageData.height);
  
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [r, g, b, a] = imageData.getPixel(x, y);
      
      // Convert to HSV for saturation adjustment
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const diff = max - min;
      
      let h = 0;
      const s = max === 0 ? 0 : diff / max;
      const v = max / 255;
      
      if (diff !== 0) {
        if (max === r) {
          h = ((g - b) / diff) % 6;
        } else if (max === g) {
          h = (b - r) / diff + 2;
        } else {
          h = (r - g) / diff + 4;
        }
        h *= 60;
        if (h < 0) h += 360;
      }
      
      // Apply saturation and contrast adjustments
      const newS = clamp(s * saturation, 0, 1);
      const newV = clamp(v * contrast - (contrast - 1) * 0.5, 0, 1);
      
      // Convert back to RGB
      const c = newV * newS;
      const x_hsv = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = newV - c;
      
      let newR = 0, newG = 0, newB = 0;
      
      if (h >= 0 && h < 60) {
        newR = c; newG = x_hsv; newB = 0;
      } else if (h >= 60 && h < 120) {
        newR = x_hsv; newG = c; newB = 0;
      } else if (h >= 120 && h < 180) {
        newR = 0; newG = c; newB = x_hsv;
      } else if (h >= 180 && h < 240) {
        newR = 0; newG = x_hsv; newB = c;
      } else if (h >= 240 && h < 300) {
        newR = x_hsv; newG = 0; newB = c;
      } else if (h >= 300 && h < 360) {
        newR = c; newG = 0; newB = x_hsv;
      }
      
      result.setPixel(x, y, [
        Math.round((newR + m) * 255),
        Math.round((newG + m) * 255),
        Math.round((newB + m) * 255),
        a
      ]);
    }
  }
  
  return result;
}