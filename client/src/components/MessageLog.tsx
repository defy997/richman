import { useGameStore } from '../store/gameStore'

export default function MessageLog() {
  const { messages } = useGameStore()

  return (
    <div className="bg-secondary rounded-xl p-4 h-48">
      <h2 className="text-lg font-bold mb-2">消息</h2>
      <div className="space-y-1 overflow-y-auto h-32">
        {messages.slice(-20).reverse().map(msg => (
          <div 
            key={msg.id}
            className={`
              text-sm px-2 py-1 rounded
              ${msg.type === 'error' ? 'bg-red-900/30 text-red-300' : ''}
              ${msg.type === 'warning' ? 'bg-yellow-900/30 text-yellow-300' : ''}
              ${msg.type === 'success' ? 'bg-green-900/30 text-green-300' : ''}
              ${msg.type === 'info' ? 'bg-gray-800/50 text-gray-300' : ''}
            `}
          >
            {msg.content}
          </div>
        ))}
      </div>
    </div>
  )
}
