import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

export default function ControlPanel() {
  const { socket, diceValue, forcedDice } = useGameStore()
  const [isRolling, setIsRolling] = useState(false)

  const handleRollDice = () => {
    if (diceValue !== null) {
      // Already rolled, need to wait or move
      return
    }
    setIsRolling(true)
    socket?.emit('rollDice')
    setTimeout(() => setIsRolling(false), 500)
  }

  const handleEndTurn = () => {
    socket?.emit('endTurn')
  }

  return (
    <div className="bg-secondary rounded-xl p-4">
      <h2 className="text-lg font-bold mb-4">操作</h2>
      
      <div className="space-y-3">
        <button
          onClick={handleRollDice}
          disabled={diceValue !== null || isRolling}
          className={`
            w-full py-3 rounded-lg font-bold transition-all
            ${diceValue !== null 
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-accent hover:bg-red-600 text-white'}
          `}
        >
          {isRolling ? '投掷中...' : diceValue !== null ? '已投掷' : '投掷骰子'}
        </button>

        <button
          onClick={handleEndTurn}
          className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-all"
        >
          结束回合
        </button>

        {forcedDice && (
          <div className="bg-purple-600/30 border border-purple-500 rounded-lg p-3 text-center">
            <div className="text-sm text-purple-300">骰子卡效果</div>
            <div className="text-2xl font-bold">{forcedDice}</div>
          </div>
        )}
      </div>
    </div>
  )
}
