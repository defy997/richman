import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

// ============ 64格方形地图 ============
// 17列 x 17行 网格
// 顶排(0-15) | 右列(16-31) | 底排(32-47) | 左列(48-63)
// 中央 15x15 空白区域放公园

const TOTAL_CELLS = 64

function levelBadge(level: number) {
  switch (level) {
    case 1: return '🏚️'
    case 2: return '🏠'
    case 3: return '🏢'
    case 4: return '🏨'
    default: return ''
  }
}

function specialUpgradeBadge(upgrade?: string) {
  switch (upgrade) {
    case 'hotel':       return '🏨'
    case 'smelter':     return '🔥'
    case 'diamondMine': return '⛏️'
    case 'agency':      return '🏢'
    case 'resort':      return '🏖️'
    case 'mall':        return '🛍️'
    case 'monument':    return '🏛️'
    default:            return ''
  }
}

function specialUpgradeName(upgrade?: string) {
  switch (upgrade) {
    case 'hotel':       return '酒店'
    case 'smelter':     return '冶炼场'
    case 'diamondMine': return '钻石矿'
    case 'agency':      return '房产中介'
    case 'resort':      return '度假区'
    case 'mall':        return '购物中心'
    case 'monument':    return '地标建筑'
    default:            return ''
  }
}

function specialIcon(type: string) {
  switch (type) {
    case 'start':      return '🚩'
    case 'bank':       return '🏦'
    case 'stock':      return '📈'
    case 'futures':    return '🛢️'
    case 'realestate': return '🏛️'
    case 'chance':     return '❓'
    case 'destiny':    return '🎯'
    case 'diamond':    return '💎'
    default:           return ''
  }
}

function cellBgColor(type: string, ownerColor?: string) {
  if (ownerColor) return ownerColor
  switch (type) {
    case 'start':      return '#16a34a'
    case 'bank':       return '#2563eb'
    case 'stock':      return '#ca8a04'
    case 'futures':    return '#0891b2'
    case 'realestate': return '#7c3aed'
    case 'chance':     return '#7c3aed'
    case 'destiny':    return '#ea580c'
    case 'diamond':    return '#db2777'
    default:           return '#374151'
  }
}

function BoardCell({ cellId }: { cellId: number }) {
  const { cells, players, selectedCell, updateGameState, socket, players: allPlayers } = useGameStore()
  const cell = cells[cellId]
  const [showActions, setShowActions] = useState(false)
  const [showSpecialUpgrade, setShowSpecialUpgrade] = useState(false)

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
    .replace(/🏦|📈|🛢️|❓|🎯|💎|🚩|🏨|🔥|⛏️|🏢/g, '')
    .trim()

  const fontSize = pureName.length <= 2 ? '10px' : pureName.length <= 4 ? '8px' : '7px'
  const isMyProperty = cell.owner === myPlayerId_
  const canBuy = isMyTurn && cell.type === 'empty' && !cell.owner && myPlayer && myPlayer.cash >= (cell.price || 0)

  // 普通升级费用（现金 + 建材）
  const UPGRADE_MAT: Record<number, { cement: number; steel: number; rubber: number }> = {
    1: { cement: 5, steel: 3, rubber: 1 },
    2: { cement: 10, steel: 6, rubber: 2 },
    3: { cement: 20, steel: 12, rubber: 4 }
  }
  const matCost = cell.level && cell.level >= 1 && cell.level <= 3 ? UPGRADE_MAT[cell.level] : null
  const upgradeCost = cell.basePrice ? Math.floor(cell.basePrice * 0.5) : 0
  const canUpgrade = isMyTurn && isMyProperty && (cell.level || 0) < 4 &&
    myPlayer && myPlayer.cash + myPlayer.deposit >= upgradeCost &&
    matCost && myPlayer.materials.cement >= matCost.cement &&
    myPlayer.materials.steel >= matCost.steel &&
    myPlayer.materials.rubber >= matCost.rubber

  // 顶级之后特殊升级
  const canSpecialUpgrade = isMyTurn && isMyProperty && (cell.level || 0) >= 4 && (!cell.upgrade || cell.upgrade === 'normal')

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

  const handleSpecialUpgrade = (e: React.MouseEvent, type: string) => {
    e.stopPropagation()
    socket?.emit('specialUpgrade', { cellId: cell.id, type })
    setShowSpecialUpgrade(false)
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
          {cell.type === 'empty' && cell.upgrade && cell.upgrade !== 'normal' && (
            <span style={{ fontSize: '11px' }}>{specialUpgradeBadge(cell.upgrade)}</span>
          )}
          {cell.type === 'empty' && (!cell.upgrade || cell.upgrade === 'normal') && cell.level! > 0 && (
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

      {(canBuy || canUpgrade || canSpecialUpgrade || (isMyProperty && (cell.level || 0) > 0)) && isSelected && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-40 flex flex-col gap-1 min-w-44"
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
          {canUpgrade && matCost && (
            <div className="px-2 py-1 bg-black/80 text-yellow-300 text-[10px] rounded shadow-lg">
              <div className="font-bold mb-0.5">⬆️ 升级至 Lv.{cell.level! + 1}</div>
              <div>💰 ${upgradeCost} | 🧱 水泥×{matCost.cement} 钢材×{matCost.steel} 橡胶×{matCost.rubber}</div>
              <button
                onClick={handleUpgrade}
                className="mt-1 w-full px-2 py-0.5 bg-yellow-600 hover:bg-yellow-700 text-white text-[10px] font-bold rounded"
              >
                ✓ 确认升级
              </button>
            </div>
          )}
          {!canUpgrade && cell.level! < 4 && isMyProperty && matCost && (
            <div className="px-2 py-1 bg-black/80 text-red-400 text-[10px] rounded shadow-lg">
              <div className="font-bold mb-0.5">⚠️ 升级需要：</div>
              <div>💰 ${upgradeCost}（现金+存款）</div>
              <div>🧱 水泥×{matCost.cement} 钢材×{matCost.steel} 橡胶×{matCost.rubber}</div>
            </div>
          )}
          {canSpecialUpgrade && !showSpecialUpgrade && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSpecialUpgrade(true) }}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap"
            >
              ⭐ 选择特殊升级
            </button>
          )}
          {canSpecialUpgrade && showSpecialUpgrade && (
            <div className="px-2 py-1 bg-black/90 rounded shadow-lg text-[10px] space-y-1 min-w-[260px]">
              <div className="text-yellow-300 font-bold">⭐ 选择特殊升级：</div>
              <button onClick={(e) => handleSpecialUpgrade(e, 'hotel')} className="block w-full text-left px-2 py-0.5 bg-blue-700 hover:bg-blue-800 text-white rounded">
                🏨 酒店（每回合按存款5%给利息）
              </button>
              <button onClick={(e) => handleSpecialUpgrade(e, 'smelter')} className="block w-full text-left px-2 py-0.5 bg-orange-700 hover:bg-orange-800 text-white rounded">
                🔥 冶炼场（每回合 +2 贵金属）
              </button>
              <button onClick={(e) => handleSpecialUpgrade(e, 'diamondMine')} className="block w-full text-left px-2 py-0.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded">
                ⛏️ 钻石矿（每回合 +2💎）
              </button>
              <button onClick={(e) => handleSpecialUpgrade(e, 'agency')} className="block w-full text-left px-2 py-0.5 bg-pink-700 hover:bg-pink-800 text-white rounded">
                🏢 房产中介（所有房产过路费翻倍）
              </button>
              <div className="border-t border-gray-600 my-1"></div>
              <div className="text-pink-300 font-bold">✨ 吸引力建筑：</div>
              <button onClick={(e) => handleSpecialUpgrade(e, 'resort')} className="block w-full text-left px-2 py-0.5 bg-teal-700 hover:bg-teal-800 text-white rounded">
                🏖️ 度假区（每回合 +$1000 · 消耗 20 吸引力）
              </button>
              <button onClick={(e) => handleSpecialUpgrade(e, 'mall')} className="block w-full text-left px-2 py-0.5 bg-fuchsia-700 hover:bg-fuchsia-800 text-white rounded">
                🛍️ 购物中心（每回合 +$500+1💎 · 消耗 15 吸引力）
              </button>
              <button onClick={(e) => handleSpecialUpgrade(e, 'monument')} className="block w-full text-left px-2 py-0.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded">
                🏛️ 地标建筑（每回合 +5 吸引力 · 消耗 30 吸引力）
              </button>
              <button onClick={(e) => { e.stopPropagation(); setShowSpecialUpgrade(false) }} className="block w-full text-center px-2 py-0.5 bg-gray-700 text-gray-300 rounded">
                ✕ 取消
              </button>
            </div>
          )}
          {isMyProperty && cell.upgrade && cell.upgrade !== 'normal' && (
            <div className="px-2 py-1 bg-purple-900/80 text-purple-200 text-[10px] rounded text-center shadow-lg">
              ⭐ 特殊建筑：{specialUpgradeName(cell.upgrade)}
              {(cell.appreciation || 0) > 0.01 && (
                <span className="ml-1 text-yellow-300">📈+{Math.round((cell.appreciation || 0) * 100)}%</span>
              )}
            </div>
          )}
          {isMyProperty && (cell.level || 0) > 0 && (!cell.upgrade || cell.upgrade === 'normal') && (
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
          gridTemplateColumns: 'repeat(17, 56px)',
          gridTemplateRows: 'repeat(17, 56px)'
        }}
      >
        {/* 顶排 0-15 (row 1, col 1-16) - 16格 */}
        {Array.from({ length: 16 }, (_, i) => i).map(id => (
          <div key={`top-${id}`} style={{ gridColumn: id + 1, gridRow: 1 }}>
            <BoardCell cellId={id} />
          </div>
        ))}

        {/* 左列 48-63 (row 16-1, col 1) - 16格 */}
        {Array.from({ length: 16 }, (_, i) => 63 - i).map((id, idx) => (
          <div key={`left-${id}`} style={{ gridColumn: 1, gridRow: 17 - idx }}>
            <BoardCell cellId={id} />
          </div>
        ))}

        {/* 底排 32-47 (row 17, col 16-1) - 16格 */}
        {Array.from({ length: 16 }, (_, i) => 47 - i).map((id, idx) => (
          <div key={`bottom-${id}`} style={{ gridColumn: 17 - idx, gridRow: 17 }}>
            <BoardCell cellId={id} />
          </div>
        ))}

        {/* 右列 16-31 (col 17, row 1-16) - 16格 */}
        {Array.from({ length: 16 }, (_, i) => i + 16).map((id, idx) => (
          <div key={`right-${id}`} style={{ gridColumn: 17, gridRow: idx + 1 }}>
            <BoardCell cellId={id} />
          </div>
        ))}

        {/* 中央公园 (row 2-16, col 2-16) */}
        <div
          style={{
            gridColumn: '2 / 17',
            gridRow: '2 / 17'
          }}
          className="bg-gradient-to-br from-green-900 to-green-950 rounded-xl border-2 border-green-700 flex flex-col items-center justify-center gap-2 p-4"
        >
          <div className="text-yellow-300 font-black tracking-widest select-none" style={{ fontSize: '20px' }}>
            RICH PARK
          </div>
          <div className="text-green-300/50 text-[10px]">64格大富翁</div>

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
