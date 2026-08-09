import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

type Mode = 'menu' | 'multiplayer' | 'singleplayer' | 'waiting-multiplayer' | 'waiting-singleplayer'

export default function Lobby() {
  const [mode, setMode] = useState<Mode>('menu')
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  // 单人模式配置
  const [aiCount, setAiCount] = useState(3)
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal')
  // 联机配置：选择房间人数上限（2-6）
  const [maxPlayers, setMaxPlayers] = useState(4)

  const { socket, addMessage, players, roomCode: currentRoom, maxPlayers: roomMaxPlayers } = useGameStore()

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      addMessage('error', '请输入你的名字')
      return
    }
    setMode('waiting-multiplayer')
    socket?.emit('createRoom', { playerName: playerName.trim(), maxPlayers })
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
    setMode('waiting-multiplayer')
    socket?.emit('joinRoom', {
      playerName: playerName.trim(),
      roomCode: roomCode.trim().toUpperCase()
    })
  }

  const handleStartSingleplayer = () => {
    if (!playerName.trim()) {
      addMessage('error', '请输入你的名字')
      return
    }
    setMode('waiting-singleplayer')
    socket?.emit('createSingleplayer', {
      playerName: playerName.trim(),
      aiCount,
      difficulty
    })
  }

  const handleStartGame = () => {
    socket?.emit('startGame')
  }

  // 等待多人游戏开始（创建或加入房间）
  if (mode === 'waiting-multiplayer' && currentRoom) {
    const isHost = players[0]?.id === socket?.id
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <div className="bg-secondary p-8 rounded-xl shadow-2xl max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-accent mb-2">RichMan Online</h1>
            <p className="text-gray-400">房间码: <span className="text-2xl font-bold text-gold tracking-widest">{currentRoom}</span></p>
          </div>

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
                {(() => {
                  const max = roomMaxPlayers || 6
                  const ready = players.length >= 2
                  return ready
                    ? `可以开始游戏了 (${players.length}/${max})`
                    : `等待更多玩家加入... (${players.length}/${max})`
                })()}
              </div>
            </div>
          </div>

          {isHost && players.length >= 2 && (
            <button
              onClick={handleStartGame}
              className="w-full py-3 bg-accent hover:bg-red-600 text-white font-bold rounded-lg transition-colors"
            >
              开始游戏
            </button>
          )}

          {isHost && players.length < 2 && (
            <p className="text-center text-gray-400">等待其他玩家加入...</p>
          )}

          {!isHost && (
            <p className="text-center text-gray-400">等待房主开始游戏...</p>
          )}

          <button
            onClick={() => setMode('menu')}
            className="w-full mt-3 py-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← 返回菜单
          </button>
        </div>
      </div>
    )
  }

  // 等待单人模式启动
  if (mode === 'waiting-singleplayer') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <div className="bg-secondary p-8 rounded-xl shadow-2xl max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-4xl mb-4">⏳</div>
            <h2 className="text-2xl font-bold text-gold mb-2">正在准备单人游戏...</h2>
            <p className="text-gray-400">AI 对手正在准备中</p>
          </div>
        </div>
      </div>
    )
  }

  // 单人模式配置界面
  if (mode === 'singleplayer') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <div className="bg-secondary p-8 rounded-xl shadow-2xl max-w-md w-full mx-4">
          <h1 className="text-3xl font-bold text-center text-accent mb-2">单人模式</h1>
          <p className="text-center text-gray-400 mb-6">
            目标：让总资产达到 <span className="text-gold font-bold">$100,000,000</span>（1亿）
          </p>

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

            <div>
              <label className="block text-sm text-gray-400 mb-2">AI 对手数量</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setAiCount(n)}
                    className={`py-2 rounded-lg font-bold transition-colors ${
                      aiCount === n
                        ? 'bg-accent text-white'
                        : 'bg-primary text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">AI 难度</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setDifficulty('easy')}
                  className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                    difficulty === 'easy'
                      ? 'bg-green-600 text-white'
                      : 'bg-primary text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  简单
                </button>
                <button
                  onClick={() => setDifficulty('normal')}
                  className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                    difficulty === 'normal'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-primary text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  普通
                </button>
                <button
                  onClick={() => setDifficulty('hard')}
                  className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                    difficulty === 'hard'
                      ? 'bg-red-600 text-white'
                      : 'bg-primary text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  困难
                </button>
              </div>
            </div>

            <button
              onClick={handleStartSingleplayer}
              className="w-full py-3 bg-gold hover:bg-yellow-500 text-primary font-bold rounded-lg transition-colors"
            >
              开始挑战亿万富翁
            </button>

            <button
              onClick={() => setMode('menu')}
              className="w-full py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
              ← 返回菜单
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 多人模式配置界面
  if (mode === 'multiplayer') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <div className="bg-secondary p-8 rounded-xl shadow-2xl max-w-md w-full mx-4">
          <h1 className="text-4xl font-bold text-center text-accent mb-8">联机对战</h1>

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

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                房间人数上限 <span className="text-xs text-gray-500">（2-6 人）</span>
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    onClick={() => setMaxPlayers(n)}
                    className={`py-2 rounded-lg font-bold transition-colors ${
                      maxPlayers === n
                        ? 'bg-accent text-white'
                        : 'bg-primary text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {n}人
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                当前选择：{maxPlayers} 人房间（房主 + {maxPlayers - 1} 位玩家）
              </div>
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

            <button
              onClick={() => setMode('menu')}
              className="w-full py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
              ← 返回菜单
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 主菜单
  return (
    <div className="min-h-screen flex items-center justify-center bg-primary">
      <div className="bg-secondary p-8 rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-accent mb-2">RichMan</h1>
          <p className="text-gray-400">大富翁 · 在线版</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => setMode('singleplayer')}
            className="w-full py-4 bg-gold hover:bg-yellow-500 text-primary font-bold rounded-lg transition-colors"
          >
            <div className="text-lg">🎯 单人模式</div>
            <div className="text-xs opacity-75 mt-1">挑战亿万富翁目标（1亿资产）</div>
          </button>

          <button
            onClick={() => setMode('multiplayer')}
            className="w-full py-4 bg-accent hover:bg-red-600 text-white font-bold rounded-lg transition-colors"
          >
            <div className="text-lg">👥 多人联机</div>
            <div className="text-xs opacity-75 mt-1">和朋友一起对战</div>
          </button>
        </div>
      </div>
    </div>
  )
}