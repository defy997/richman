import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

interface FloatingPanelProps {
  title: string
  icon: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function FloatingPanel({ title, icon, children, defaultOpen = false }: FloatingPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <>
      {/* 触发按钮 */}
      <div className="p-3" onClick={() => setIsOpen(true)}>
        <div className="bg-primary rounded-lg p-2 cursor-pointer hover:bg-primary/80 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <span className="text-sm font-bold">{title}</span>
            </div>
            <span className="text-gray-400 text-xs">点击展开 →</span>
          </div>
        </div>
      </div>

      {/* 悬浮层 */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setIsOpen(false)}>
          <div
            className="bg-secondary rounded-xl shadow-2xl overflow-hidden"
            style={{ maxWidth: '90vw', maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary/50 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xl">{icon}</span>
                <span className="text-sm font-bold">{title}</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-lg transition-colors"
              >
                ×
              </button>
            </div>

            {/* 内容 */}
            <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 60px)' }}>
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export { FloatingPanel }
export default FloatingPanel
