import { defineConfig } from 'unocss'
import presetUno from '@unocss/preset-uno'
import presetIcons from '@unocss/preset-icons'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      }
    })
  ],
  theme: {
    colors: {
      primary: '#3b82f6',
      secondary: '#6b7280',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
    animation: {
      'float': 'float 6s ease-in-out infinite',
      'gradient': 'gradient 8s ease infinite',
    }
  },
  shortcuts: {
    'glass': 'backdrop-blur-xl bg-white/80 border border-white/20',
    'glass-dark': 'backdrop-blur-xl bg-gray-900/80 border border-white/10',
    'btn-primary': 'px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105',
    'btn-secondary': 'px-4 py-2 bg-white/90 text-gray-700 rounded-lg font-medium shadow-sm hover:shadow-md transition-all duration-200 hover:bg-white',
    'card-glass': 'glass rounded-2xl shadow-xl shadow-black/5',
    'upload-zone': 'border-2 border-dashed border-gray-300 rounded-xl p-8 text-center transition-all duration-300 hover:border-blue-400 hover:bg-blue-50/50',
  },
  rules: [
    ['bg-mesh-gradient', {
      'background': 'radial-gradient(at 40% 20%, hsla(28,100%,74%,0.1) 0px, transparent 50%), radial-gradient(at 80% 0%, hsla(189,100%,56%,0.1) 0px, transparent 50%), radial-gradient(at 0% 50%, hsla(355,100%,93%,0.1) 0px, transparent 50%), radial-gradient(at 80% 50%, hsla(340,100%,76%,0.1) 0px, transparent 50%), radial-gradient(at 0% 100%, hsla(22,100%,77%,0.1) 0px, transparent 50%), radial-gradient(at 80% 100%, hsla(242,100%,70%,0.1) 0px, transparent 50%), radial-gradient(at 0% 0%, hsla(343,100%,76%,0.1) 0px, transparent 50%)'
    }]
  ]
})