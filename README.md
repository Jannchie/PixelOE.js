# PixelOE.js

**Detail-Oriented ***Pixel***ization based on Contrast-Aware ***O***utline ***E***xpansion in JavaScript**

A high-performance JavaScript/TypeScript implementation of the PixelOE algorithm that creates stunning pixel art from high-resolution images without AI or complex networks.

## ✨ Features

- 🎨 **High-Quality Pixelization**: Based on the innovative PixelOE algorithm that preserves crucial visual details
- 🚀 **Pure Browser Implementation**: Runs entirely in the browser without server dependencies
- ⚡ **Performance Optimized**: Handles large images with memory and stack overflow optimizations
- 🎯 **Multiple Downsampling Modes**: Contrast-aware, center pixel, bilinear, nearest, and k-centroid clustering
- 🔧 **Customizable Parameters**: Adjust pixel size, outline thickness, color settings, and more
- 📱 **Modern Interface**: Responsive Vue 3 interface with mobile support
- 🌐 **Web-Friendly**: Real-time processing with progress feedback

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and pnpm (recommended) or npm
- Modern browser with Canvas API support

### Installation

```bash
# Clone the repository
git clone https://github.com/[your-repo]/pixeloe.js
cd pixeloe.js

# Install dependencies
pnpm install
```

### Development

```bash
# Start development server
pnpm dev
```

Open `http://localhost:3000` to view the application.

### Production Build

```bash
# Build for production
pnpm build

# Preview production build
pnpm preview
```

## 🎯 Usage

### Web Interface

1. **Upload Image**: Click "Choose Image File" to upload your image
2. **Adjust Parameters**: Use the control panel to fine-tune processing settings
3. **Process**: Click "Start Processing" to begin pixelization
4. **Download**: Save the result as a PNG file

### Parameter Guide

- **Pixel Size (2-16)**: Controls the size of final pixels - larger values create more obvious pixelation
- **Outline Thickness (0-5)**: Controls outline expansion strength, helps preserve fine details
- **Target Size**: Output image resolution (auto-calculated if not specified)
- **Downsampling Modes**:
  - `Contrast-Aware`: Intelligently selects the most representative pixels (recommended)
  - `Center Pixel`: Uses the center pixel of each block
  - `Bilinear`: Bilinear interpolation for smooth results
  - `Nearest`: Nearest neighbor for sharp, crisp pixels
  - `K-Centroid`: K-means clustering for representative colors
  - `Lanczos`: High-quality Lanczos resampling
- **Contrast/Saturation**: Adjust final image color effects
- **Color Matching**: Preserve color style similar to the original image

## 🏗️ API Usage

```typescript
import { PixelImageData, PixelOE } from 'pixeloe.js'

// Create PixelOE instance
const pixelOE = new PixelOE()

// Load image data
const imageData = PixelImageData.fromImageData(canvasImageData)

// Configure options
const options = {
  pixelSize: 8,
  thickness: 2,
  targetSize: 256,
  mode: 'contrast' as const,
  colorMatching: true,
  contrast: 1.0,
  saturation: 1.0,
  noUpscale: false,
  noDownscale: false
}

// Process image
const result = await pixelOE.pixelize(imageData, options)

// Get result as ImageData
const resultImageData = result.result.toImageData()
```

## 🔧 Performance Optimizations

This implementation includes several performance optimizations specifically designed for large image processing:

### Large Image Handling

- **Auto-scaling**: Images over 2MP are automatically resized to prevent memory issues
- **Stack Overflow Protection**: Optimized array operations to avoid stack overflow on large datasets
- **Adaptive Parameters**: Large images automatically adjust processing parameters for better performance

### Memory Management

- **TypedArrays**: Uses Float32Array for memory-efficient numerical computations
- **Chunked Processing**: Large array operations use loops instead of spread operators
- **Sampling Optimization**: Uses sampling for statistical calculations on large arrays

### WebGL Acceleration (Experimental)

- **GPU Morphology**: WebGL-based morphological operations for supported browsers
- **Fallback Support**: Automatic fallback to CPU implementation when WebGL is unavailable

## 📁 Project Structure

```shell
src/
├── core/                   # Core algorithms
│   ├── imageData.ts        # Image data processing utilities
│   ├── colorSpace.ts       # Color space conversions (RGB, LAB, HSV)
│   ├── morphology.ts       # Morphological operations (dilation, erosion)
│   ├── webglMorphology.ts  # WebGL-accelerated morphology
│   ├── outline.ts          # Contrast-aware outline expansion
│   ├── downscale.ts        # Various downsampling algorithms
│   ├── color.ts            # Color processing and matching
│   ├── quantization.ts     # Color quantization and dithering
│   └── sharpen.ts          # Image sharpening filters
├── utils/                  # Utility functions
│   └── math.ts             # Mathematical utilities
├── components/             # Vue components
│   └── PixelOEDemo.vue     # Main demo interface
├── pixeloe.ts              # Main PixelOE class
├── index.ts                # Library exports
└── App.vue                 # Application entry point
```

## 🔍 Algorithm Details

### 1. Contrast-Aware Outline Expansion

The core innovation of PixelOE is its outline expansion technique:

1. **Weight Map Generation**: Analyzes local contrast and brightness patterns
2. **Selective Morphology**: Applies dilation and erosion based on feature importance
3. **Detail Preservation**: Ensures fine details survive the subsequent downscaling

### 2. Intelligent Downsampling

Multiple downsampling strategies for different artistic effects:

- **Contrast-Aware**: Selects pixels based on local contrast statistics
- **K-Centroid**: Uses K-means clustering to find representative colors
- **Traditional Methods**: Center, nearest, bilinear, and Lanczos resampling

### 3. Color Processing

- **LAB Color Space**: Separates luminance and color processing for better results
- **Color Matching**: Transfers color palette from original to maintain artistic consistency
- **HSV Adjustments**: Fine-tune contrast and saturation in perceptual color space

## 📊 Performance Benchmarks

Tested on various image sizes with different browsers:

| Image Size | Chrome | Firefox | Safari | Processing Time |
| ---------- | ------ | ------- | ------ | --------------- |
| 512x512    | ~0.8s  | ~1.2s   | ~1.0s  | Fast            |
| 1024x1024  | ~2.1s  | ~3.2s   | ~2.8s  | Medium          |
| 1920x1080  | ~4.5s  | ~6.8s   | ~5.9s  | Slow            |

*Results may vary based on hardware and browser optimizations.*

## ⚠️ Browser Compatibility

- **Chrome/Edge**: Full support including WebGL acceleration
- **Firefox**: Full support with optimized fallbacks
- **Safari**: Full support on macOS/iOS
- **Mobile Browsers**: Supported with automatic memory management

## 🛠️ Technology Stack

- **Vue 3**: Reactive user interface with Composition API
- **TypeScript**: Type-safe development with full IntelliSense
- **Vite**: Fast development and optimized builds
- **PrimeVue**: Modern UI component library
- **UnoCSS**: Utility-first CSS framework
- **Vitest**: Fast unit testing framework
- **Canvas API**: Core image processing capabilities
- **WebGL** (optional): GPU-accelerated operations

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests once
pnpm test:run
```

## 📝 Changelog

### v0.1.1 (Current)

- ✅ Complete PixelOE algorithm implementation
- ✅ Modern Vue 3 user interface with PrimeVue
- ✅ Large image optimization and error handling
- ✅ **6 downsampling modes** including K-centroid clustering
- ✅ Real-time parameter adjustment
- ✅ Download functionality with multiple formats
- ✅ WebGL acceleration for morphological operations
- ✅ Comprehensive test suite
- ✅ Stack overflow protection for K-means clustering

### v0.1.0

- Initial implementation with basic features

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Ensure all tests pass (`pnpm test`)
6. Submit a pull request

## 📄 License

This project follows the same license as the original PixelOE implementation.

## 🙏 Credits

This JavaScript implementation is based on the original **PixelOE** algorithm developed by **Shin-Ying Yeh**.

**Original Repository**: <https://github.com/KohakuBlueleaf/PixelOE>

The original Python implementation introduced the innovative contrast-aware outline expansion technique that makes this pixel art generation possible. This JavaScript port brings the same high-quality results to web browsers with additional performance optimizations for client-side processing.

### Key Contributors

- **Original Algorithm**: [KohakuBlueleaf](https://github.com/KohakuBlueleaf) - Creator of the PixelOE algorithm
- **JavaScript Port**: Performance optimizations, web implementation, and browser compatibility

## 📚 References

If you use this implementation in your research or projects, please consider citing the original work:

```bibtex
@misc{PixelOE,
    title={Detail-Oriented Pixelization based on Contrast-Aware Outline Expansion.},
    author={Shin-Ying Yeh},
    year={2024},
    month={March},
    howpublished=\url{https://github.com/KohakuBlueleaf/PixelOE},
}
```
