import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App'

// 全局 fetch 补丁：自动携带 httpOnly cookie（后端已支持 cookie 认证）
const _origFetch = window.fetch.bind(window)
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  return _origFetch(input, { credentials: 'include', ...init })
}

const basePath = import.meta.env.VITE_BASE_PATH || ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basePath}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
