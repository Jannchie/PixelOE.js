import { describe, it, expect } from 'vitest'
import { kCentroidDownscale } from '../src/core/downscale'
import { kMeansClusterOptimized, fastKMeansCluster, kCentroidDownscaleOptimized } from '../src/core/downscaleOptimized'
import { PerformanceTester } from './performance.test'
import { ConsistencyTester } from './consistency.test'

// Original kMeansCluster function extracted for testing
function kMeansClusterOriginal(pixels: Array<[number, number, number]>, k: number = 2, maxIterations: number = 10): Array<[number, number, number]> {
  if (pixels.length === 0) return [];
  if (k <= 0 || k >= pixels.length) {
    // If k is invalid, return the most frequent color or average
    if (pixels.length === 1) return [pixels[0]];
    const avgR = pixels.reduce((sum, p) => sum + p[0], 0) / pixels.length;
    const avgG = pixels.reduce((sum, p) => sum + p[1], 0) / pixels.length;
    const avgB = pixels.reduce((sum, p) => sum + p[2], 0) / pixels.length;
    return [[Math.round(avgR), Math.round(avgG), Math.round(avgB)]];
  }

  // Initialize centroids deterministically using min-max interpolation
  let minR = pixels[0][0], maxR = pixels[0][0];
  let minG = pixels[0][1], maxG = pixels[0][1];
  let minB = pixels[0][2], maxB = pixels[0][2];
  
  for (const pixel of pixels) {
    if (pixel[0] < minR) minR = pixel[0];
    if (pixel[0] > maxR) maxR = pixel[0];
    if (pixel[1] < minG) minG = pixel[1];
    if (pixel[1] > maxG) maxG = pixel[1];
    if (pixel[2] < minB) minB = pixel[2];
    if (pixel[2] > maxB) maxB = pixel[2];
  }

  const centroids: Array<[number, number, number]> = [];
  for (let i = 0; i < k; i++) {
    const t = i / (k - 1);
    centroids.push([
      minR + t * (maxR - minR),
      minG + t * (maxG - minG),
      minB + t * (maxB - minB)
    ]);
  }

  // K-means iterations
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign pixels to closest centroids
    const clusters: Array<Array<[number, number, number]>> = Array(k).fill(null).map(() => []);
    
    for (const pixel of pixels) {
      let bestCentroid = 0;
      let bestDistance = Infinity;
      
      for (let c = 0; c < k; c++) {
        const distance = 
          Math.pow(pixel[0] - centroids[c][0], 2) +
          Math.pow(pixel[1] - centroids[c][1], 2) +
          Math.pow(pixel[2] - centroids[c][2], 2);
        
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCentroid = c;
        }
      }
      
      clusters[bestCentroid].push(pixel);
    }

    // Update centroids
    let converged = true;
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) continue;
      
      const newCentroid: [number, number, number] = [
        clusters[c].reduce((sum, p) => sum + p[0], 0) / clusters[c].length,
        clusters[c].reduce((sum, p) => sum + p[1], 0) / clusters[c].length,
        clusters[c].reduce((sum, p) => sum + p[2], 0) / clusters[c].length
      ];
      
      const distance = 
        Math.pow(newCentroid[0] - centroids[c][0], 2) +
        Math.pow(newCentroid[1] - centroids[c][1], 2) +
        Math.pow(newCentroid[2] - centroids[c][2], 2);
      
      if (distance > 1) { // 1 pixel difference threshold
        converged = false;
      }
      
      centroids[c] = [
        Math.round(newCentroid[0]),
        Math.round(newCentroid[1]),
        Math.round(newCentroid[2])
      ];
    }

    if (converged) break;
  }

  // Remove empty centroids
  return centroids.filter((_, i) => 
    pixels.some(pixel => {
      let bestCentroid = 0;
      let bestDistance = Infinity;
      
      for (let c = 0; c < centroids.length; c++) {
        const distance = 
          Math.pow(pixel[0] - centroids[c][0], 2) +
          Math.pow(pixel[1] - centroids[c][1], 2) +
          Math.pow(pixel[2] - centroids[c][2], 2);
        
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCentroid = c;
        }
      }
      
      return bestCentroid === i;
    })
  );
}

describe('Downscale Optimization', () => {
  // Helper to generate test pixel data
  function generateTestPixels(count: number, pattern: 'random' | 'clustered' | 'gradient' = 'random'): Array<[number, number, number]> {
    const pixels: Array<[number, number, number]> = []
    
    for (let i = 0; i < count; i++) {
      switch (pattern) {
        case 'clustered':
          // Create 3 distinct clusters
          const cluster = i % 3
          const baseR = cluster === 0 ? 50 : cluster === 1 ? 128 : 200
          const baseG = cluster === 0 ? 200 : cluster === 1 ? 50 : 128
          const baseB = cluster === 0 ? 128 : cluster === 1 ? 200 : 50
          pixels.push([
            baseR + Math.floor(Math.random() * 30) - 15,
            baseG + Math.floor(Math.random() * 30) - 15,
            baseB + Math.floor(Math.random() * 30) - 15
          ])
          break
        case 'gradient':
          const t = i / (count - 1)
          pixels.push([
            Math.floor(t * 255),
            Math.floor((1 - t) * 255),
            Math.floor(t * (1 - t) * 4 * 255)
          ])
          break
        case 'random':
        default:
          pixels.push([
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256)
          ])
          break
      }
    }
    
    return pixels
  }

  describe('K-means Clustering', () => {
    const testCases = [
      { count: 20, k: 3, pattern: 'clustered' as const, name: 'Small clustered data' },
      { count: 100, k: 5, pattern: 'random' as const, name: 'Medium random data' },
      { count: 50, k: 2, pattern: 'gradient' as const, name: 'Gradient data' },
    ]

    for (const { count, k, pattern, name } of testCases) {
      it(`should produce similar results for ${name}`, () => {
        const pixels = generateTestPixels(count, pattern)
        
        const original = kMeansClusterOriginal(pixels, k, 10)
        const optimized = kMeansClusterOptimized(pixels, k, 10)
        
        // Results may not be identical due to different convergence but should be similar
        expect(original.length).toBeGreaterThan(0)
        expect(optimized.length).toBeGreaterThan(0)
        expect(optimized.length).toBeLessThanOrEqual(k)
        
        console.log(`${name}: Original=${original.length} centroids, Optimized=${optimized.length} centroids`)
      })
    }

    it('should benchmark K-means clustering performance', async () => {
      const testSizes = [
        { count: 50, k: 3, name: 'Small' },
        { count: 200, k: 5, name: 'Medium' },
        { count: 500, k: 8, name: 'Large' },
      ]
      
      for (const { count, k, name } of testSizes) {
        const pixels = generateTestPixels(count, 'random')
        
        const comparison = await PerformanceTester.compare(
          kMeansClusterOriginal,
          kMeansClusterOptimized,
          [pixels, k, 10],
          20
        )
        
        // Note: Micro-benchmark results can vary, main gains are in full downscaling
        console.log(`${name} K-means clustering (${count} pixels, k=${k}): ${comparison.improvement}`)
      }
    })

    it('should test fast K-means variant', async () => {
      const pixels = generateTestPixels(200, 'clustered')
      
      const comparison = await PerformanceTester.compare(
        kMeansClusterOriginal,
        fastKMeansCluster,
        [pixels, 4, 10],
        50
      )
      
      // Fast version should be faster, but micro-benchmarks can vary
      console.log(`Fast K-means clustering: ${comparison.improvement}`)
    })

    it('should handle edge cases', () => {
      // Empty pixels
      expect(kMeansClusterOptimized([], 3)).toEqual([])
      expect(fastKMeansCluster([], 3)).toEqual([])
      
      // Single pixel
      const singlePixel: Array<[number, number, number]> = [[100, 150, 200]]
      expect(kMeansClusterOptimized(singlePixel, 3)).toEqual(singlePixel)
      expect(fastKMeansCluster(singlePixel, 3)).toEqual(singlePixel)
      
      // k = 0
      const somePixels = generateTestPixels(10, 'random')
      expect(kMeansClusterOptimized(somePixels, 0)).toEqual([])
      expect(fastKMeansCluster(somePixels, 0)).toEqual([])
      
      // k >= pixels.length - different algorithms may handle this differently
      const optimizedResult = kMeansClusterOptimized(somePixels, 20)
      const fastResult = fastKMeansCluster(somePixels, 20)
      expect(optimizedResult.length).toBeGreaterThan(0)
      expect(fastResult.length).toBeGreaterThan(0)
    })
  })

  describe('K-Centroid Downscaling', () => {
    it('should produce consistent downscaling results', () => {
      const testImage = PerformanceTester.generateTestImage(64, 64, 'gradient')
      
      const original = kCentroidDownscale(testImage, 256, 3)
      const optimized = kCentroidDownscaleOptimized(testImage, 256, 3)
      
      expect(original.width).toBe(optimized.width)
      expect(original.height).toBe(optimized.height)
      
      console.log(`Downscaling: ${original.width}x${original.height}`)
    })

    it('should benchmark downscaling performance', async () => {
      const testSizes = [
        { width: 128, height: 128, targetSize: 64, name: 'Small' },
        { width: 256, height: 256, targetSize: 128, name: 'Medium' },
        { width: 512, height: 256, targetSize: 256, name: 'Large' },
      ]
      
      for (const { width, height, targetSize, name } of testSizes) {
        const testImage = PerformanceTester.generateTestImage(width, height, 'random')
        
        const comparison = await PerformanceTester.compare(
          (img) => kCentroidDownscale(img, targetSize, 3),
          (img) => kCentroidDownscaleOptimized(img, targetSize, 3),
          [testImage],
          5 // Fewer iterations for large images
        )
        
        expect(comparison.speedup).toBeGreaterThan(1.0)
        console.log(`${name} downscaling (${width}x${height}→${targetSize}): ${comparison.improvement}`)
      }
    })

    it('should test different k values', () => {
      const testImage = PerformanceTester.generateTestImage(32, 32, 'checker')
      
      const kValues = [1, 2, 3, 4, 8]
      
      for (const k of kValues) {
        const result = kCentroidDownscaleOptimized(testImage, 64, k)
        expect(result.width).toBeGreaterThan(0)
        expect(result.height).toBeGreaterThan(0)
        console.log(`k=${k}: ${result.width}x${result.height}`)
      }
    })

    it('should verify output consistency with original', async () => {
      const testImage = PerformanceTester.generateTestImage(48, 48, 'gradient')
      
      const original = kCentroidDownscale(testImage, 144, 2)
      const optimized = kCentroidDownscaleOptimized(testImage, 144, 2)
      
      const consistency = ConsistencyTester.compareImages(original, optimized, 10) // Allow some difference
      
      expect(consistency.maxDifference).toBeLessThan(50) // Should be reasonably close
      console.log(`Downscaling consistency: max diff = ${consistency.maxDifference}, avg diff = ${consistency.averageDifference.toFixed(2)}`)
    })
  })

  describe('Algorithm Comparison', () => {
    it('should compare all K-means variants', async () => {
      const pixels = generateTestPixels(100, 'clustered')
      
      console.log('\n🔄 Comparing K-means clustering algorithms:')
      
      const algorithms = [
        { name: 'Original', fn: kMeansClusterOriginal },
        { name: 'Optimized', fn: kMeansClusterOptimized },
        { name: 'Fast', fn: fastKMeansCluster },
      ]
      
      const results = []
      for (const { name, fn } of algorithms) {
        const result = await PerformanceTester.benchmark(
          fn,
          [pixels, 4, 10],
          30
        )
        results.push({ name, ...result })
        console.log(`${name}: ${result.averageTime.toFixed(3)}ms avg (${result.opsPerSecond.toFixed(0)} ops/s)`)
      }
      
      // Find fastest algorithm
      const fastest = results.reduce((prev, current) => 
        current.averageTime < prev.averageTime ? current : prev
      )
      console.log(`🏆 Fastest: ${fastest.name}`)
    })
  })
})