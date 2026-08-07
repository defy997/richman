import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

// 骰子点阵
const DICE_DOTS: Record<number, number[][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]]
}

function DiceFace({ value }: { value: number }) {
  const dots = DICE_DOTS[value] || DICE_DOTS[1]
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1 w-full h-full p-2">
      {Array.from({ length: 9 }).map((_, i) => {
        const row = Math.floor(i / 3)
        const col = i % 3
        const hasDot = dots.some(([r, c]) => r === row && c === col)
        return (
          <div
            key={i}
            className={`rounded-full ${hasDot ? 'bg-accent shadow-inner' : ''}`}
          />
        )
      })}
    </div>
  )
}

export default function ControlPanel() {
  const { socket, diceValue, forcedDice, currentPlayerIndex, players, myPlayerId } = useGameStore()
  const [isRolling, setIsRolling] = useState(false)

  const currentPlayer = players[currentPlayerIndex]
  const isMyTurn = currentPlayer?.id === myPlayerId

  const handleRollDice = () => {
    if (diceValue !== null || isRolling) return
    setIsRolling(true)
    socket?.emit('rollDice')
    setTimeout(() => setIsRolling(false), 800)
  }

  const handleEndTurn = () => {
    socket?.emit('endTurn')
  }

  return (
    <div className="bg-secondary rounded-xl p-4">
      <h2 className="text-lg font-bold mb-4">🎲 行动</h2>

      {/* 骰子显示区域 - 始终可见 */}
      <div className="flex items-center justify-center mb-4">
        <div
          className={`
            w-24 h-24 bg-gradient-to-br from-white to-gray-200
            rounded-2xl shadow-2xl border-4 border-gray-300
            transition-transform duration-300
            ${isRolling ? 'animate-spin' : ''}
            ${diceValue !== null && !isRolling ? 'scale-110' : ''}
          `}
          style={{
            boxShadow: 'inset 0 -8px 16px rgba(0,0,0,0.2), 0 8px 16px rgba(0,0,0,0.4)'
          }}
        >
          {diceValue !== null ? (
            <DiceFace value={diceValue} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">
              {isRolling ? '...' : '等待投掷'}
            </div>
          )}
        </div>
      </div>

      {/* 强制骰子提示 */}
      {forcedDice !== null && (
        <div className="bg-purple-600/30 border border-purple-500 rounded-lg p-2 mb-3 text-center">
          <div className="text-xs text-purple-300">骰子卡效果</div>
          <div className="text-lg font-bold text-purple-200">强制投出 {forcedDice}</div>
        </div>
      )}

      {/* 操作按钮 */}
      {isMyTurn && (
        <div className="space-y-2">
          <button
            onClick={handleRollDice}
            disabled={diceValue !== null || isRolling}
            className={`
              w-full py-3 rounded-lg font-bold text-lg transition-all
              ${diceValue !== null
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-accent to-red-600 hover:from-red-600 hover:to-accent text-white shadow-lg'}
            `}
          >
            {isRolling ? '🎲 投掷中...' : diceValue !== null ? `已投出 ${diceValue}` : '🎲 投掷骰子'}
          </button>

          <button
            onClick={handleEndTurn}
            disabled={diceValue === null}
            className={`
              w-full py-2 rounded-lg font-bold transition-all
              ${diceValue === null
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-600 hover:bg-gray-500 text-white'}
            `}
          >
            ⏭️ 结束回合
          </button>
        </div>
      )}

      {!isMyTurn && (
        <div className="text-center text-gray-400 text-sm py-2">
          等待 {currentPlayer?.name}{currentPlayer?.isAI && ' 🤖'} 行动...
        </div>
      )}
    </div>
  )
}