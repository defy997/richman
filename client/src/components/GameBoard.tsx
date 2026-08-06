import { useGameStore } from '../store/gameStore'
import Board from './Board'
import PlayerInfo from './PlayerInfo'
import ControlPanel from './ControlPanel'
import MessageLog from './MessageLog'
import Dice from './Dice'
import StockPanel from './StockPanel'
import CardPanel from './CardPanel'
import BankPanel from './BankPanel'

export default function GameBoard() {
  const { 
    currentPlayerIndex, 
    players, 
    gamePhase,
    roomCode,
    currentTurn
  } = useGameStore()

  const currentPlayer = players[currentPlayerIndex]
  const isMyTurn = currentPlayer?.id === useGameStore.getState().socket?.id

  return (
    <div className="min-h-screen bg-primary p-4">
      {/* Header */}
      <header className="bg-secondary rounded-lg p-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-accent">RichMan</h1>
          <span className="text-gray-400">房间: {roomCode}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400">回合: {currentTurn}</span>
          <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded-full" 
              style={{ backgroundColor: currentPlayer?.color }}
            />
            <span className={isMyTurn ? 'text-gold font-bold' : ''}>
              {currentPlayer?.name}
              {isMyTurn && ' (你)'}
            </span>
          </div>
          {isMyTurn && (
            <span className="px-2 py-1 bg-accent rounded text-sm font-bold animate-pulse">
              你的回合
            </span>
          )}
        </div>
      </header>

      {/* Main Game Area */}
      <div className="flex gap-4">
        {/* Left: Board */}
        <div className="flex-1">
          <Board />
        </div>

        {/* Right: Panels */}
        <div className="w-80 space-y-4">
          <PlayerInfo />
          {isMyTurn && <ControlPanel />}
          <StockPanel />
          <CardPanel />
          <BankPanel />
          <MessageLog />
        </div>
      </div>

      {/* Dice Area */}
      {isMyTurn && <Dice />}
    </div>
  )
}
