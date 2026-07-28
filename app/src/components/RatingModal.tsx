import { X, Star } from 'lucide-react';

interface RatingModalProps {
  onClose: () => void;
  ratingValue: number;
  setRatingValue: (v: number) => void;
  ratingComment: string;
  setRatingComment: (v: string) => void;
  onSubmit: () => void;
}

export default function RatingModal({ onClose, ratingValue, setRatingValue, ratingComment, setRatingComment, onSubmit }: RatingModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="w-80 rounded-2xl p-5" style={{ background: 'var(--color-bg-main)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>评价</h3>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--color-text-light)' }}><X size={18} /></button>
        </div>
        <div className="flex items-center justify-center gap-2 mb-4">
          {[1,2,3,4,5].map(i => (
            <button key={i} onClick={() => setRatingValue(i)}>
              <Star size={28} fill={i <= ratingValue ? 'var(--color-star)' : 'none'} style={{ color: 'var(--color-star)' }} />
            </button>
          ))}
        </div>
        <textarea
          value={ratingComment}
          onChange={e => setRatingComment(e.target.value)}
          placeholder="说点什么吧..."
          className="w-full p-3 rounded-xl text-sm resize-none"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }}
          rows={3}
        />
        <button onClick={onSubmit} className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}>
          提交评价
        </button>
      </div>
    </div>
  );
}
