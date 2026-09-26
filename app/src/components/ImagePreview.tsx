import { X } from 'lucide-react'

interface ImagePreviewProps {
  src: string
  alt?: string
  isOpen: boolean
  onClose: () => void
}

export default function ImagePreview({ src, alt, isOpen, onClose }: ImagePreviewProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        onClick={onClose}
      >
        <X size={24} color="white" />
      </button>
      <img
        src={src}
        alt={alt || '预览图片'}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
