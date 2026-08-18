import { Check, Copy, ExternalLink, Share2, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

interface ShareButtonProps {
  /** 分享的网址,默认当前网站根地址 */
  url?: string;
}

/**
 * 扫码分享按钮
 *
 * 右下角悬浮按钮,点击弹出对话框显示真实可扫的二维码.
 * 用户用微信扫一扫即可在手机打开网站.
 * 二维码由 qrcode 库实时生成,指向当前网站根地址.
 */
export default function ShareButton({ url }: ShareButtonProps) {
  // 分享地址:优先用传入的,否则取当前网站根地址(去掉路径和查询)
  const shareUrl =
    url ?? (typeof window !== 'undefined' ? window.location.origin : '');

  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // 对话框打开时才生成二维码,省点性能
  useEffect(() => {
    if (!open || !shareUrl || qrDataUrl) return;
    QRCode.toDataURL(shareUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch((err: unknown) => {
        console.error('二维码生成失败:', err);
      });
  }, [open, shareUrl, qrDataUrl]);

  // 对话框关闭时重置二维码缓存(下次打开重新生成,确保地址最新)
  useEffect(() => {
    if (!open) {
      setQrDataUrl('');
      setCopied(false);
    }
  }, [open]);

  // 复制链接到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 在新标签页打开(方便电脑用户)
  const handleOpen = () => {
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        aria-label="扫码分享"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
          boxShadow: '0 4px 16px rgba(var(--color-primary-rgb), 0.35)',
        }}
      >
        <Share2 size={20} />
      </button>

      {/* 对话框:原生实现,匹配项目 CSS 变量风格 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl p-5"
            style={{ background: 'var(--color-bg-card)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="关闭"
            >
              <X size={18} />
            </button>

            {/* 标题 */}
            <h3 className="text-center text-lg font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>
              扫码访问本站
            </h3>

            {/* 二维码图片:白底居中,微信扫一扫可直接识别 */}
            <div className="flex justify-center mb-3">
              <div
                className="w-64 h-64 rounded-xl flex items-center justify-center p-3"
                style={{ background: '#ffffff' }}
              >
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="网站二维码"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>生成中...</div>
                )}
              </div>
            </div>

            {/* 网址文字 */}
            <div className="text-center text-xs mb-4 break-all" style={{ color: 'var(--color-text-secondary)' }}>
              {shareUrl.replace(/^https?:\/\//, '')}
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3 mb-3">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border-light)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {copied ? (
                  <>
                    <Check size={16} style={{ color: 'var(--color-success)' }} /> 已复制
                  </>
                ) : (
                  <>
                    <Copy size={16} /> 复制链接
                  </>
                )}
              </button>
              <button
                onClick={handleOpen}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border-light)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <ExternalLink size={16} /> 新窗打开
              </button>
            </div>

            {/* 使用提示 */}
            <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              微信扫一扫二维码即可在手机打开
              <br />
              也可复制链接发到微信聊天
            </p>
          </div>
        </div>
      )}
    </>
  );
}
