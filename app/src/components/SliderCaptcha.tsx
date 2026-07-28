import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../api/config';

interface CaptchaData {
  captchaId: string;
  background: string;
  piece: string;
  width: number;
  height: number;
  pieceW: number;
  pieceH: number;
  targetY: number;
}

interface Props {
  onVerified: (captchaId: string, token: string) => void;
  onReset?: () => void;
}

export default function SliderCaptcha({ onVerified, onReset }: Props) {
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  // 用 ref 保存最新回调，避免依赖变化导致无限循环
  const onVerifiedRef = useRef(onVerified);
  const onResetRef = useRef(onReset);
  onVerifiedRef.current = onVerified;
  onResetRef.current = onReset;

  const fetchCaptcha = useCallback(async (skipReset = false) => {
    setLoading(true);
    setError('');
    setVerified(false);
    setOffsetX(0);
    currentXRef.current = 0;
    if (!skipReset) onResetRef.current?.();
    try {
      const res = await fetch(`${API_BASE_URL}/auth/captcha`);
      const data = await res.json();
      if (data.success) {
        setCaptcha(data.data);
      } else {
        setError(data.message || '验证码加载失败');
      }
    } catch (e) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaptcha(true); // 初始加载不调用 onReset，避免 key 变化导致无限循环
  }, [fetchCaptcha]);

  const handleStart = (clientX: number) => {
    if (verified || !captcha) return;
    setDragging(true);
    setError('');
    startXRef.current = clientX;
    currentXRef.current = offsetX;
  };

  const handleMove = (clientX: number) => {
    if (!dragging || !captcha || !trackRef.current) return;
    const trackWidth = trackRef.current.clientWidth - captcha.pieceW;
    let dx = clientX - startXRef.current + currentXRef.current;
    dx = Math.max(0, Math.min(dx, trackWidth));
    setOffsetX(dx);
  };

  const handleEnd = async () => {
    if (!dragging || !captcha) return;
    setDragging(false);
    const x = offsetX;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/captcha/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captchaId: captcha.captchaId, x }),
      });
      const data = await res.json();
      if (data.success && data.data?.token) {
        setVerified(true);
        onVerifiedRef.current(captcha.captchaId, data.data.token);
      } else {
        setError(data.message || '验证失败，请重试');
        setOffsetX(0);
        currentXRef.current = 0;
        fetchCaptcha();
      }
    } catch (e) {
      setError('网络错误');
      setOffsetX(0);
      currentXRef.current = 0;
    }
  };

  return (
    <div className="w-full">
      <div
        className="relative rounded-xl overflow-hidden mb-3 select-none"
        style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)' }}
      >
        {captcha ? (
          <div className="relative" style={{ width: captcha.width, height: captcha.height, maxWidth: '100%' }}>
            <img
              src={captcha.background}
              alt="验证码背景"
              className="block w-full h-full"
              draggable={false}
            />
            <img
              src={captcha.piece}
              alt="拼图块"
              className="absolute top-0 left-0"
              style={{
                width: captcha.pieceW,
                height: captcha.pieceH,
                transform: `translate(${offsetX}px, ${captcha.targetY}px)`,
                cursor: verified ? 'default' : 'grab',
                touchAction: 'none',
              }}
              draggable={false}
              onMouseDown={e => handleStart(e.clientX)}
              onTouchStart={e => handleStart(e.touches[0].clientX)}
            />
          </div>
        ) : (
          <div className="h-36 flex items-center justify-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {loading ? '加载中...' : error || '验证码加载失败'}
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        className="relative h-10 rounded-full"
        style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)' }}
        onMouseMove={e => handleMove(e.clientX)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchMove={e => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
      >
        <div
          className="absolute top-0 left-0 h-full rounded-full flex items-center justify-center text-xs font-medium transition-all"
          style={{
            width: captcha ? captcha.pieceW : 40,
            transform: `translateX(${offsetX}px)`,
            background: verified ? '#7CB342' : dragging ? 'var(--color-primary)' : 'var(--color-bg-card)',
            color: verified ? '#fff' : 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            cursor: verified ? 'default' : 'grab',
            touchAction: 'none',
          }}
          onMouseDown={e => handleStart(e.clientX)}
          onTouchStart={e => handleStart(e.touches[0].clientX)}
        >
          {verified ? '✓' : '➤'}
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center text-xs pointer-events-none"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {verified ? '验证通过' : '拖动左侧滑块完成拼图'}
        </div>
      </div>

      {error && !verified && (
        <div className="mt-2 text-xs text-center" style={{ color: 'var(--color-primary)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
