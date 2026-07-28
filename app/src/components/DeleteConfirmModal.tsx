import { Trash2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmModal({ isOpen, onClose, onConfirm }: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center fade-in"
      style={{ background: 'rgba(var(--color-text-dark-rgb), 0.25)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 mx-4 scale-in"
        style={{
          background: 'rgba(255,253,249,0.98)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(var(--color-border-warm-rgb), 0.5)',
          maxWidth: '340px',
          boxShadow: '0 16px 48px rgba(var(--color-text-dark-rgb), 0.15)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(var(--color-danger-rgb), 0.08)' }}>
          <Trash2 size={18} style={{ color: 'var(--color-danger)' }} />
        </div>
        <h3 className="text-base font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>删除确认</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
          确定删除这行数据吗？删除后不可恢复，保证金将原路退回。
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(245,237,227,0.8)', color: 'var(--color-text-muted)', border: '1px solid rgba(232,222,208,0.5)' }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg, var(--color-danger), var(--color-danger))', boxShadow: '0 4px 12px rgba(var(--color-danger-rgb), 0.25)' }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
