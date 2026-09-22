/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = (env.VITE_BASE_PATH || '/').replace(/\/+$/, '') + '/'
  
  return {
    base: basePath,
    plugins: [react()],
    css: {
      postcss: path.resolve(__dirname, './postcss.config.mjs'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
    server: {
      port: parseInt(env.VITE_PORT || '4000'),
      strictPort: true,
      open: false,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
        '/admin': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
        '/wechat-qr.png': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
        '/alipay-qr.png': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
        '/avatars': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'router-vendor': ['react-router'],
            'ui-vendor': ['lucide-react'],
          },
        },
      },
    },
  }
})
