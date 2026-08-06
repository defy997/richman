import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

export default function Lobby() {
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const { socket, updateGameState, addMessage, players, roomCode: currentRoom } = useGameStore()

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      addMessage('error', '请输入你的名字')
      return
    }
    setIsCreating(true)
    socket?.emit('createRoom', { playerName: playerName.trim() })
  }

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      addMessage('error', '请输入你的名字')
      return
    }
    if (!roomCode.trim()) {
      addMessage('error', '请输入房间码')
      return
    }
    socket?.emit('joinRoom', { 
      playerName: playerName.trim(), 
      roomCode: roomCode.trim().toUpperCase() 
    })
  }

  const handleStartGame = () => {
    socket?.emit('startGame')
  }

  if (isCreating || currentRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <div className="bg-secondary p-8 rounded-xl shadow-2xl max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-accent mb-2">RichMan Online</h1>
            <p className="text-gray-400">
              {currentRoom ? `房间码: ${currentRoom}` : '创建房间中...'}
            </p>
          </div>

          {currentRoom && (
            <div className="bg-primary rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold mb-3">等待玩家加入</h3>
              <div className="space-y-2">
                {players.map((player, index) => (
                  <div key={player.id} className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: player.color }}
                    />
                    <span>{player.name}</span>
                    {index === 0 && <span className="text-xs text-gold">(房主)</span>}
                  </div>
                ))}
                <div className="text-gray-500 text-sm mt-2">
                  {players.length < 6 ? `等待更多玩家加入... (${players.length}/6)` : '可以开始游戏了'}
                </div>
              </div>
            </div>
          )}

          {players[0]?.id === socket?.id && players.length >= 2 && (
            <button
              onClick={handleStartGame}
              className="w-full py-3 bg-accent hover:bg-red-600 text-white font-bold rounded-lg transition-colors"
            >
              开始游戏
            </button>
          )}

          {players[0]?.id !== socket?.id && (
            <p className="text-center text-gray-400">等待房主开始游戏...</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary">
      <div className="bg-secondary p-8 rounded-xl shadow-2xl max-w-md w-full mx-4">
        <h1 className="text-4xl font-bold text-center text-accent mb-8">RichMan</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">你的名字</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={10}
              className="w-full px-4 py-3 bg-primary border border-gray-700 rounded-lg focus:border-accent focus:outline-none transition-colors"
              placeholder="输入名字..."
            />
          </div>

          <button
            onClick={handleCreateRoom}
            className="w-full py-3 bg-accent hover:bg-red-600 text-white font-bold rounded-lg transition-colors"
          >
            创建房间
          </button>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-700" />
            <span className="text-gray-500">或者</span>
            <div className="flex-1 h-px bg-gray-700" />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">房间码</label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-full px-4 py-3 bg-primary border border-gray-700 rounded-lg focus:border-accent focus:outline-none transition-colors uppercase"
              placeholder="输入房间码..."
            />
          </div>

          <button
            onClick={handleJoinRoom}
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
          >
            加入房间
          </button>
        </div>
      </div>
    </div>
  )
}
