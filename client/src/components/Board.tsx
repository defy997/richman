import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

// ============ 60格方形地图 ============
// 11列 x 11行 网格
// 顶排(0-14) | 右列(15-29) | 底排(30-44) | 左列(45-59)
// 中央 9x9 空白区域放公园

const TOTAL_CELLS = 60

function levelBadge(level: number) {
  switch (level) {
    case 1: return '🏚️'
    case 2: return '🏠'
    case 3: return '🏢'
    case 4: return '🏨'
    default: return ''
  }
}

function specialIcon(type: string) {
  switch (type) {
    case 'start':   return '🚩'
    case 'bank':    return '🏦'
    case 'stock':   return '📈'
    case 'futures': return '🛢️'
    case 'chance':  return '❓'
    case 'destiny': return '🎯'
    case 'diamond': return '💎'
    default:        return ''
  }
}

function cellBgColor(type: string, ownerColor?: string) {
  if (ownerColor) return ownerColor
  switch (type) {
    case 'start':   return '#16a34a'
    case 'bank':    return '#2563eb'
    case 'stock':   return '#ca8a04'
    case 'futures': return '#0891b2'
    case 'chance':  return '#7c3aed'
    case 'destiny': return '#ea580c'
    case 'diamond': return '#db2777'
    default:        return '#374151'
  }
}

function BoardCell({ cellId }: { cellId: number }) {
  const { cells, players, selectedCell, updateGameState, socket, players: allPlayers } = useGameStore()
  const cell = cells[cellId]
  const [showActions, setShowActions] = useState(false)

  const myPlayerId_ = useGameStore(s => s.myPlayerId)
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex)
  const isMyTurn = allPlayers[currentPlayerIndex]?.id === myPlayerId_
  const myPlayer = allPlayers.find(p => p.id === myPlayerId_)

  if (!cell) {
    return (
      <div className="w-8 h-8 rounded bg-gray-800 border border-gray-700 flex items-center justify-center">
        <span className="text-gray-600 text-[10px]">{cellId}</span>
      </div>
    )
  }

  const owner = cell.owner ? players.find(p => p.id === cell.owner) : null
  const isSelected = selectedCell === cellId
  const playersHere = players.filter(p => p.position === cellId && !p.isBankrupt)
  const bgColor = cellBgColor(cell.type, owner?.color)

  const handleClick = () => {
    updateGameState({ selectedCell: isSelected ? null : cellId })
    setShowActions(!isSelected ? false : !showActions)
  }

  const pureName = (cell.name || `地${cellId}`)
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
    .replace(/🏦|📈|🛢️|❓|🎯|💎|🚩/g, '')
    .trim()

  const fontSize = pureName.length <= 2 ? '10px' : pureName.length <= 4 ? '8px' : '7px'
  const isMyProperty = cell.owner === myPlayerId_
  const canBuy = isMyTurn && cell.type === 'empty' && !cell.owner && myPlayer && myPlayer.cash >= (cell.price || 0)
  const canUpgrade = isMyTurn && isMyProperty && (cell.level || 0) < 4 && myPlayer && myPlayer.cash >= Math.floor((cell.basePrice || 0) * 0.5)
  const upgradeCost = cell.basePrice ? Math.floor(cell.basePrice * 0.5) : 0

  const handleBuy = (e: React.MouseEvent) => {
    e.stopPropagation()
    socket?.emit('buyProperty', { cellId: cell.id })
    setShowActions(false)
  }

  const handleUpgrade = (e: React.MouseEvent) => {
    e.stopPropagation()
    socket?.emit('upgradeProperty', { cellId: cell.id })
    setShowActions(false)
  }

  return (
    <div className="relative">
      <div
        onClick={handleClick}
        className={`
          relative rounded cursor-pointer select-none transition-all duration-200
          ${isSelected ? 'ring-2 ring-yellow-400 scale-110 z-20' : 'hover:scale-105 hover:z-10'}
        `}
        style={{
          backgroundColor: bgColor,
          borderColor: owner ? owner.color : '#6b7280',
          borderWidth: '2px',
          width: '56px',
          height: '56px',
          boxShadow: owner ? `0 0 10px ${owner.color}77` : '0 1px 4px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px'
        }}
      >
        <div className="flex items-center justify-between w-full px-0.5">
          <span style={{ fontSize: '9px' }}>{specialIcon(cell.type)}</span>
          {cell.type === 'empty' && cell.level! > 0 && (
            <span style={{ fontSize: '9px' }}>{levelBadge(cell.level!)}</span>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center w-full px-0.5">
          <span
            className="font-bold text-white text-center"
            style={{
              fontSize,
              textShadow: '0 1px 3px rgba(0,0,0,0.95)',
              lineHeight: 1.2,
              wordBreak: 'break-all',
              maxHeight: '28px',
              overflow: 'hidden'
            }}
          >
            {pureName}
          </span>
        </div>

        {cell.type === 'empty' && cell.basePrice! > 0 && (
          <div className="text-yellow-300 font-bold" style={{ fontSize: '7px', textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}>
            ${cell.basePrice}
          </div>
        )}

        {playersHere.length > 0 && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5" style={{ zIndex: 30 }}>
            {playersHere.slice(0, 4).map((p, i) => (
              <div
                key={p.id}
                className="w-3 h-3 rounded-full border border-white shadow"
                style={{ backgroundColor: p.color, marginLeft: i > 0 ? -4 : 0 }}
              />
            ))}
          </div>
        )}
      </div>

      {(canBuy || canUpgrade || (isMyProperty && (cell.level || 0) > 0)) && isSelected && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-40 flex flex-col gap-1 min-w-20"
          onClick={e => e.stopPropagation()}
        >
          {canBuy && (
            <button
              onClick={handleBuy}
              className="px-3 py-1 bg-accent hover:bg-red-600 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap"
            >
              购买 ${cell.price}
            </button>
          )}
          {canUpgrade && (
            <button
              onClick={handleUpgrade}
              className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap"
            >
              升级 Lv.{cell.level! + 1} (${upgradeCost})
            </button>
          )}
          {isMyProperty && (cell.level || 0) > 0 && (
            <div className="px-2 py-1 bg-black/70 text-yellow-300 text-[10px] rounded text-center">
              Lv.{cell.level} {levelBadge(cell.level!)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Board() {
  const { players, myPlayerId, cells } = useGameStore()
  const myPlayer = players.find(p => p.id === myPlayerId)

  // 60格方形布局：11列 x 11行
  // 顶排 0-14 (row 1, col 1-15)
  // 右列 15-29 (row 2-16, col 16)
  // 底排 30-44 (row 16, col 16-2) — 倒序
  // 左列 45-59 (row 15-1, col 1)

  return (
    <div
      className="bg-gradient-to-br from-secondary to-primary rounded-2xl p-3 shadow-2xl flex items-center justify-center"
      style={{ width: 'fit-content', margin: '0 auto' }}
    >
      <div
        className="grid gap-0.5"
        style={{
          gridTemplateColumns: 'repeat(16, 56px)',
          gridTemplateRows: 'repeat(16, 56px)'
        }}
      >
        {/* 顶排 0-14 (row 1) */}
        {Array.from({ length: 15 }, (_, i) => i).map(id => (
          <div key={`top-${id}`} style={{ gridColumn: id + 1, gridRow: 1 }}>
            <BoardCell cellId={id} />
          </div>
        ))}

        {/* 右侧边缘列 (col 16, row 2-15) */}
        {Array.from({ length: 14 }, (_, i) => i + 1).map(row => (
          <div key={`right-edge-${row}`} style={{ gridColumn: 16, gridRow: row }}>
            <div className="w-14 h-14" />
          </div>
        ))}

        {/* 左列 45-59 (row 15-1, col 1) */}
        {Array.from({ length: 15 }, (_, i) => 59 - i).map((id, idx) => (
          <div key={`left-${id}`} style={{ gridColumn: 1, gridRow: 15 - idx }}>
            <BoardCell cellId={id} />
          </div>
        ))}

        {/* 底排 30-44 (row 16, col 15-1) */}
        {Array.from({ length: 15 }, (_, i) => 44 - i).map((id, idx) => (
          <div key={`bottom-${id}`} style={{ gridColumn: 15 - idx, gridRow: 16 }}>
            <BoardCell cellId={id} />
          </div>
        ))}

        {/* 右列 15-29 (col 16, row 1-15) */}
        {Array.from({ length: 15 }, (_, i) => i + 15).map((id, idx) => (
          <div key={`right-${id}`} style={{ gridColumn: 16, gridRow: idx + 1 }}>
            <BoardCell cellId={id} />
          </div>
        ))}

        {/* 中央公园 (row 2-15, col 2-15) */}
        <div
          style={{
            gridColumn: '2 / 16',
            gridRow: '2 / 16'
          }}
          className="bg-gradient-to-br from-green-900 to-green-950 rounded-xl border-2 border-green-700 flex flex-col items-center justify-center gap-2 p-4"
        >
          <div className="text-yellow-300 font-black tracking-widest select-none" style={{ fontSize: '20px' }}>
            RICH PARK
          </div>
          <div className="text-green-300/50 text-[10px]">60格大富翁</div>

          <div className="bg-black/40 rounded-lg px-3 py-2 min-w-32">
            <div className="text-gray-400 text-[10px] mb-1 text-center">🏆 排名</div>
            <div className="space-y-0.5">
              {[...players].sort((a, b) => (b.totalAssets || 0) - (a.totalAssets || 0)).map((p, idx) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded ${p.id === myPlayerId ? 'bg-yellow-500/20' : ''}`}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-yellow-400 font-bold w-3">{idx + 1}</span>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-gray-300 truncate max-w-14">{p.name}</span>
                    {p.isAI && '🤖'}
                    {p.id === myPlayerId && ' (我)'}
                  </div>
                  <span className="text-yellow-300 font-bold">${(p.totalAssets || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
