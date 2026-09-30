import { ArrowLeft, Download, ExternalLink, Globe, Share2, Smartphone } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

const SITE_URL = typeof window !== 'undefined' ? window.location.origin : ''

export default function QrPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)

  // Draw QR code placeholder + poster on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Card dimensions
    const w = 360
    const h = 560
    canvas.width = w * 2
    canvas.height = h * 2
    ctx.scale(2, 2)

    // Background gradient - 使用实际颜色值，Canvas 不支持 CSS 变量
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, '#FFFDF9')
    grad.addColorStop(1, '#FAF6F1')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Border
    ctx.strokeStyle = '#E8DED0'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

    // Header bar
    ctx.fillStyle = '#E87A5D'
    ctx.fillRect(0, 0, w, 70)

    // Heart icon (circle)
    ctx.beginPath()
    ctx.arc(180, 50, 28, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFDF9'
    ctx.fill()

    // Heart
    ctx.fillStyle = '#E87A5D'
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('\u2665', 180, 59)

    // Title
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('微光亦是永恒', 180, 30)

    // Subtitle
    ctx.fillStyle = '#8B7B6B'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('精准匹配 · 缘分从数据开始', 180, 105)

    // Divider
    ctx.strokeStyle = '#F0E4D4'
    ctx.beginPath()
    ctx.moveTo(40, 125)
    ctx.lineTo(320, 125)
    ctx.stroke()

    // Steps
    const steps = [
      ['1', '扫码进入页面'],
      ['2', '填写个人资料'],
      ['3', '系统自动匹配'],
      ['4', '找到相似的人'],
    ]
    steps.forEach(([num, text], i) => {
      const y = 155 + i * 35
      // Number circle
      ctx.beginPath()
      ctx.arc(65, y, 12, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(232, 122, 93, 0.1)'
      ctx.fill()
      ctx.strokeStyle = '#F5B8A4'
      ctx.lineWidth = 1
      ctx.stroke()
      // Number
      ctx.fillStyle = '#E87A5D'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(num, 65, y + 4)
      // Text
      ctx.fillStyle = '#3D2E20'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(text, 90, y + 4)
    })

    // QR code area - 兼容旧浏览器的圆角矩形绘制
    ctx.fillStyle = '#F5EDE3'
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(105, 310, 150, 150, 8)
    } else {
      // 手动绘制圆角矩形（兼容旧浏览器）
      const r = 8,
        x = 105,
        y = 310,
        rw = 150,
        rh = 150
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + rw, y, x + rw, y + rh, r)
      ctx.arcTo(x + rw, y + rh, x, y + rh, r)
      ctx.arcTo(x, y + rh, x, y, r)
      ctx.arcTo(x, y, x + rw, y, r)
      ctx.closePath()
    }
    ctx.fill()
    ctx.strokeStyle = '#E8DED0'
    ctx.lineWidth = 1
    ctx.stroke()

    // 生成真实可扫的二维码并画到二维码区域(替换原来的随机方块假二维码)
    QRCode.toDataURL(SITE_URL, {
      width: 300,
      margin: 1,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    })
      .then((dataUrl) => {
        const img = new Image()
        img.onload = () => {
          // 二维码画到海报的二维码框内(留 5px 白边)
          ctx.drawImage(img, 110, 315, 140, 140)
        }
        img.src = dataUrl
      })
      .catch((err: unknown) => {
        console.error('海报二维码生成失败:', err)
      })

    // URL below QR
    ctx.fillStyle = '#B5A698'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(SITE_URL.replace('https://', '').replace('http://', ''), 180, 485)

    // Bottom tip
    ctx.fillStyle = '#6BAF7D'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('\u2713 人工核验保障真实信息', 180, 515)

    // Footer
    ctx.fillStyle = '#8B7B6B'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('长按识别二维码 · 或用浏览器打开', 180, 545)
  }, [])

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = '微光亦是永恒-海报.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const handleCopy = () => {
    navigator.clipboard
      .writeText(SITE_URL)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // 剪贴板 API 不可用时使用降级方案
        const textarea = document.createElement('textarea')
        textarea.value = SITE_URL
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        try {
          document.execCommand('copy')
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          // 忽略复制失败
        }
        document.body.removeChild(textarea)
      })
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/"
            className="p-2 rounded-lg hover-warm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>
            分享到微信
          </h1>
        </div>

        {/* Poster Preview */}
        <div className="flex justify-center mb-6">
          <canvas
            ref={canvasRef}
            style={{
              width: '360px',
              height: '560px',
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(var(--color-text-dark-rgb), 0.12)',
            }}
          />
        </div>

        {/* Actions */}
        <div className="space-y-3 mb-6">
          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white"
            style={{
              background:
                'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
            }}
          >
            <Download size={16} /> 下载海报(打印贴出去)
          </button>
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-light)',
              color: 'var(--color-text-muted)',
            }}
          >
            <Share2 size={16} /> {copied ? '已复制链接!' : '复制链接到微信'}
          </button>
        </div>

        {/* WeChat Tips */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <h3
            className="text-sm font-medium mb-3 flex items-center gap-2"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <Smartphone size={15} style={{ color: 'var(--color-success)' }} />
            微信中使用
          </h3>
          <div className="space-y-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <p>1. 把链接复制到微信聊天窗口,发送给朋友</p>
            <p>2. 点击链接即可在微信内打开</p>
            <p>3. 也可以转发到朋友圈,配上文字说明</p>
            <p>4. 长按识别海报中的二维码进入</p>
          </div>
        </div>

        {/* Browser Tips */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          <h3
            className="text-sm font-medium mb-3 flex items-center gap-2"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <Globe size={15} style={{ color: 'var(--color-primary)' }} />
            建议用浏览器打开
          </h3>
          <div className="space-y-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <p>1. 微信中点击右上角 → 在浏览器中打开</p>
            <p>2. 浏览器不受微信限制,体验更流畅</p>
            <p>3. 可以添加到主屏幕,像App一样使用</p>
          </div>
        </div>

        {/* Save to Home Screen */}
        <div
          className="rounded-xl p-4 mb-8"
          style={{
            background: 'rgba(var(--color-success-rgb), 0.04)',
            border: '1px solid #C4E0CC',
          }}
        >
          <h3
            className="text-sm font-medium mb-3 flex items-center gap-2"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <ExternalLink size={15} style={{ color: 'var(--color-success)' }} />
            添加到主屏幕(免安装App)
          </h3>
          <div className="space-y-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <p>
              <strong>iPhone Safari</strong>:打开网页 → 点击底部分享按钮 → "添加到主屏幕"
            </p>
            <p>
              <strong>Android Chrome</strong>:打开网页 → 菜单 → "添加到主屏幕"
            </p>
            <p>添加后桌面会出现图标,点击直接打开,和App一样用</p>
          </div>
        </div>
      </div>
    </div>
  )
}
