/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = (env.VITE_BASE_URL || '/jzxr').replace(/\/+$/, '') + '/'
  
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
      historyApiFallback: {
        rewrites: [
          // 仅精确匹配无斜杠 base 路径，自动补斜杠
          { from: new RegExp(`^${basePath.slice(0, -1)}$`), to: basePath },
        ],
      },
      middleware: {
        before: [
          (req, res, next) => {
            const rawPath = req.url?.split('?')[0] || '/'
            const noSlashBase = basePath.slice(0, -1)
            // 访问 /jzxr（含或不含 query）统一 301 到 /jzxr/
            if (rawPath === noSlashBase) {
              const query = req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''
              res.writeHead(301, { Location: basePath + query })
              res.end()
              return
            }
            next()
          },
        ],
      },
      proxy: {
        '/jzxr/api': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/jzxr/, ''),
        },
        '/jzxr/admin': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/jzxr/, ''),
        },
        '/jzxr/wechat-qr.png': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/jzxr/, ''),
        },
        '/jzxr/alipay-qr.png': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/jzxr/, ''),
        },
        '/jzxr/uploads': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/jzxr/, ''),
        },
        '/jzxr/avatars': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/jzxr/, ''),
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
