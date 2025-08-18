import { PixelImageData } from './imageData';
import { rgbToLab, labToRgb } from './colorSpace';
import { mean, standardDeviation, clamp } from '../utils/math';

/**
 * Color processing utilities
 */

/**
 * Match color statistics between source and target images
 */
export function matchColor(source: PixelImageData, target: PixelImageData, level: number = 5): PixelImageData {
  const result = source.clone();
  
  // Convert both images to LAB
  const sourceStats = calculateColorStats(source);
  const targetStats = calculateColorStats(target);
  
  // Apply statistical matching
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const [r, g, b, a] = source.getPixel(x, y);
      const [l, a_lab, b_lab] = rgbToLab(r, g, b);
      
      // Normalize and rescale each channel
      const normalizedL = (l - sourceStats.l.mean) / (sourceStats.l.std || 1);
      const normalizedA = (a_lab - sourceStats.a.mean) / (sourceStats.a.std || 1);
      const normalizedB = (b_lab - sourceStats.b.mean) / (sourceStats.b.std || 1);
      
      const matchedL = normalizedL * targetStats.l.std + targetStats.l.mean;
      const matchedA = normalizedA * targetStats.a.std + targetStats.a.mean;
      const matchedB = normalizedB * targetStats.b.std + targetStats.b.mean;
      
      const [newR, newG, newB] = labToRgb(matchedL, matchedA, matchedB);
      result.setPixel(x, y, [newR, newG, newB, a]);
    }
  }
  
  // Apply wavelet color fix
  return waveletColorFix(result, target, level);
}

/**
 * Calculate color statistics for an image
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
 * Simple wavelet-like color correction
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
 * Simple Gaussian blur approximation using box blur
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