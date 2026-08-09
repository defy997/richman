import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'

export default function MessageLog() {
  const { messages } = useGameStore()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 新消息自动滚动到顶部
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [messages.length])

  return (
    <div
      ref={containerRef}
      className="bg-primary rounded-lg p-2 h-full overflow-y-auto"
      style={{ minHeight: 0 }}
    >
      <div className="space-y-1">
        {messages.slice(-50).reverse().map(msg => (
          <div
            key={msg.id}
            className={`
              text-xs px-2 py-1 rounded
              ${msg.type === 'error' ? 'bg-red-900/30 text-red-300' : ''}
              ${msg.type === 'warning' ? 'bg-yellow-900/30 text-yellow-300' : ''}
              ${msg.type === 'success' ? 'bg-green-900/30 text-green-300' : ''}
              ${msg.type === 'info' ? 'bg-gray-800/50 text-gray-300' : ''}
            `}
          >
            {msg.content}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-gray-500 text-xs text-center py-4">
            暂无消息
          </div>
        )}
      </div>
    </div>
  )
}
