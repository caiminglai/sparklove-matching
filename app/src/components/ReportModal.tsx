import { X, Upload } from 'lucide-react';
import { useToast } from './Toast';

interface ReportModalProps {
  onClose: () => void;
  reportType: string;
  setReportType: (v: string) => void;
  reportDescription: string;
  setReportDescription: (v: string) => void;
  onSubmit: () => void;
  proofImage: File | null;
  setProofImage: (file: File | null) => void;
}

const REPORT_TYPES = ['虚假信息', '骚扰他人', '不诚信行为', '其他'];

export default function ReportModal({ onClose, reportType, setReportType, reportDescription, setReportDescription, onSubmit, proofImage, setProofImage }: ReportModalProps) {
  const { toast } = useToast();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (allowedTypes.includes(file.type)) {
        setProofImage(file);
      } else {
        toast('请上传有效的图片文件（JPG、PNG、WebP、GIF）', 'error');
      }
    }
  };

  const removeImage = () => {
    setProofImage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="w-80 rounded-2xl p-5" style={{ background: 'var(--color-bg-main)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>举报用户</h3>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--color-text-light)' }}><X size={18} /></button>
        </div>

        <div className="space-y-2 mb-4">
          {REPORT_TYPES.map(t => (
            <button key={t} onClick={() => setReportType(t)}
              className="w-full text-left px-3 py-2 rounded-xl text-sm transition-all"
              style={{
                background: reportType === t ? 'rgba(var(--color-primary-rgb), 0.1)' : 'rgba(255,255,255,0.6)',
                color: reportType === t ? 'var(--color-primary)' : 'var(--color-text-primary)',
                border: reportType === t ? '1px solid rgba(var(--color-primary-rgb), 0.3)' : '1px solid transparent'
              }}>
              {t}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500">凭证图片（可选）</label>
            {proofImage ? (
              <div className="flex items-center gap-2 flex-1">
                <img src={URL.createObjectURL(proofImage)} alt="预览" className="w-8 h-8 rounded-lg object-cover border border-gray-200" />
                <span className="text-xs text-gray-600">已选择</span>
                <button onClick={removeImage} className="p-1 rounded-lg" style={{ color: 'var(--color-primary)' }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <Upload size={14} />
                <span>上传</span>
              </label>
            )}
          </div>
        </div>

        <textarea
          value={reportDescription}
          onChange={e => setReportDescription(e.target.value)}
          placeholder="补充说明（可选）"
          className="w-full p-3 rounded-xl text-sm resize-none"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', outline: 'none' }}
          rows={3}
        />
        <button onClick={onSubmit} className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}>
          提交举报
        </button>
      </div>
    </div>
  );
}
