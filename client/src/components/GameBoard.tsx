import { useGameStore } from '../store/gameStore'
import Board from './Board'
import PlayerInfo from './PlayerInfo'
import ControlPanel from './ControlPanel'
import StockPanel from './StockPanel'
import CardPanel from './CardPanel'
import BankPanel from './BankPanel'
import FuturesPanel from './FuturesPanel'
import MessageLog from './MessageLog'
import Calendar from './Calendar'
import RealEstatePanel from './RealEstatePanel'
import RumorReportModal, { useRumorReport } from './RumorReportModal'

export default function GameBoard() {
  const {
    currentPlayerIndex,
    players,
    gamePhase,
    roomCode,
    currentTurn,
    gameDate,
    mode,
    targetAssets,
    winnerId,
    myPlayerId
  } = useGameStore()

  const currentPlayer = players[currentPlayerIndex]
  const isMyTurn = currentPlayer?.id === myPlayerId
  const { rumorReport, closeRumorReport } = useRumorReport()
  const myPlayer = players.find(p => p.id === myPlayerId)
  const myAssets = myPlayer?.totalAssets ?? 0
  const progressPercent = mode === 'singleplayer' && targetAssets > 0
    ? Math.min(100, (myAssets / targetAssets) * 100)
    : 0

  const isWinner = mode === 'singleplayer' && gamePhase === 'ended' && winnerId === myPlayerId

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      {/* Header */}
      <header className="bg-secondary rounded-lg p-2 mb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-accent">RichMan</h1>
            <span className="text-gray-400 text-xs">房间: {roomCode}</span>
            {mode === 'singleplayer' && (
              <span className="px-2 py-0.5 bg-gold text-primary text-xs font-bold rounded">单人</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-xs">回合: {currentTurn}</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentPlayer?.color }} />
              <span className={`text-xs ${isMyTurn ? 'text-gold font-bold' : 'text-gray-300'}`}>
                {currentPlayer?.name}{currentPlayer?.isAI && ' 🤖'}{isMyTurn && ' (你)'}
              </span>
              {currentPlayer?.hasTonghuashun && (
                <span className="text-[10px] bg-blue-600 text-white px-1 py-0.5 rounded" title="已装备同花顺软件">📱</span>
              )}
            </div>
            {isMyTurn && (
              <span className="px-2 py-0.5 bg-accent rounded text-xs font-bold animate-pulse">你的回合</span>
            )}
          </div>
        </div>

        {/* 进度条 */}
        {mode === 'singleplayer' && targetAssets > 0 && (
          <div className="mt-1">
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-gray-400">目标进度 (1亿富翁)</span>
              <span className="text-gold font-bold">
                ${myAssets.toLocaleString()} / ${targetAssets.toLocaleString()} ({progressPercent.toFixed(2)}%)
              </span>
            </div>
            <div className="w-full bg-primary rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* 谣言卡报告弹窗（仅当前玩家可见） */}
      {rumorReport && (
        <RumorReportModal report={rumorReport} onClose={closeRumorReport} />
      )}

      {/* 胜利弹窗 */}
      {isWinner && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
          <div className="bg-secondary rounded-2xl p-8 max-w-md text-center border-2 border-gold shadow-2xl">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-gold mb-4">亿万富翁达成！</h2>
            <p className="text-gray-300 mb-2">
              总资产: <span className="text-gold font-bold text-2xl">${myAssets.toLocaleString()}</span>
            </p>
            <p className="text-gray-400 mb-6">共用 {currentTurn} 回合达成目标！</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-accent hover:bg-red-600 text-white font-bold rounded-lg"
            >
              再来一局
            </button>
          </div>
        </div>
      )}

      {/* 游戏结束弹窗 */}
      {gamePhase === 'ended' && !isWinner && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
          <div className="bg-secondary rounded-2xl p-8 max-w-md text-center">
            <div className="text-4xl mb-4">😢</div>
            <h2 className="text-2xl font-bold text-accent mb-4">游戏结束</h2>
            <p className="text-gray-300 mb-4">
              {mode === 'singleplayer' ? '未能达成亿万富翁目标' : '本次对局结束'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-accent hover:bg-red-600 text-white font-bold rounded-lg"
            >
              返回主菜单
            </button>
          </div>
        </div>
      )}

      {/* 主内容区：左侧地图 + 中间日历+日志（垂直方向，与地图同高） + 右侧玩家信息 */}
      <div className="flex-1 flex gap-2 min-h-0">
        {/* 左侧：棋盘 */}
        <div className="flex-1 flex flex-col gap-2 min-w-0 overflow-auto">
          <div className="flex-1 overflow-auto" id="map-container">
            <Board />
          </div>
        </div>

        {/* 中间：日历 + 日志（与地图平行 - 同高） */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-2">
          <Calendar date={gameDate} />
          <div className="bg-secondary rounded-xl p-2 flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="text-sm font-bold mb-2 px-1 flex items-center justify-between">
              <span>📜 游戏日志</span>
              <span className="text-[10px] text-gray-500">滚轮查看历史</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <MessageLog />
            </div>
          </div>
        </div>

        {/* 右侧：玩家信息 + 控制面板 */}
        <div className="w-72 flex-shrink-0 space-y-2">
          <ControlPanel />
          <PlayerInfo />
        </div>
      </div>

      {/* 底部悬浮按钮栏 */}
      <div className="flex-shrink-0 mt-2 grid grid-cols-5 gap-1">
        <StockPanel />
        <FuturesPanel />
        <BankPanel />
        <RealEstatePanel />
        <CardPanel />
      </div>
    </div>
  )
}
