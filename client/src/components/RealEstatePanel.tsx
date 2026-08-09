import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../store/gameStore'

export default function RealEstatePanel() {
  const { socket, cells, players, myPlayerId, gameDate } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)

  const myPlayer = players.find(p => p.id === myPlayerId)
  const myProps = useMemo(() => cells.filter(c => c.owner === myPlayerId), [cells, myPlayerId])
  const others = players.filter(p => p.id !== myPlayerId)

  // 拍卖中的地皮
  const auctions = useMemo(() => cells.filter(c => c.auctionActive), [cells])
  // 计算当前回合是否要开始新一轮拍卖
  const daysSinceStart = gameDate ? (new Date(gameDate).getTime() - new Date('2026-01-01').getTime()) / 86400000 : 0

  const handleBid = (cellId: number, currentBid: number) => {
    const minBid = Math.floor((currentBid || 0) * 1.1) + 1
    const bidStr = window.prompt(`出价（至少 $${minBid.toLocaleString()}）`, String(minBid))
    const bid = parseInt(bidStr || '0')
    if (!bid || bid < minBid) return
    socket?.emit('buyAuction', { cellId, bid })
  }

  const handleTrade = (cellId: number) => {
    const targetName = window.prompt(`卖给谁？\n可选：${others.map(o => o.name).join('、')}`)
    const target = others.find(o => o.name === targetName)
    if (!target) return alert('目标不存在')
    const priceStr = window.prompt(`售价（$）`)
    const price = parseInt(priceStr || '0')
    if (!price || price <= 0) return
    if (!window.confirm(`将地皮以 $${price.toLocaleString()} 卖给 ${target.name}？`)) return
    socket?.emit('tradeProperty', { cellId, targetPlayerId: target.id, price })
  }

  // 卖给房地产交易中心（地皮变回空地，玩家获得 70% 现金回收）
  const handleSellToCenter = (cellId: number) => {
    if (!myPlayer) return
    if (myPlayer.position !== 32) return alert('需在房地产交易中心才能卖给交易所')
    const cell = cells[cellId]
    if (!cell) return
    const levelMultiplier = 1 + (cell.level || 0) * 0.5
    const recoveryRate = cell.fromAuction ? 1.0 : 0.7
    const salePrice = Math.max(
      Math.floor(cell.basePrice * levelMultiplier * recoveryRate),
      Math.floor(cell.basePrice * 0.5)
    )
    const label = cell.level && cell.level >= 1 ? `${cell.level}级` : '空地'
    if (!window.confirm(`将 ${cell.name}（${label}）以 $${salePrice.toLocaleString()} 卖给房地产交易中心？\n该地皮将变回空地。`)) return
    socket?.emit('sellProperty', { cellId })
  }

  const handleUseSeizeCard = () => {
    if (!myPlayer) return
    if ((myPlayer.diamonds || 0) < 200) return alert('钻石不足 200 💎')
    if (!window.confirm(`花费 200 💎 抢占一块非顶级地皮？`)) return
    socket?.emit('useSeizeCard', { cardName: '占地卡' })
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setIsOpen(true) }}
        className="bg-primary rounded-lg p-2 cursor-pointer hover:bg-primary/80 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏛️</span>
            <span className="text-sm font-bold">房地产交易中心</span>
          </div>
          <span className="text-gray-400 text-xs">
            {auctions.length > 0 ? `🔨拍卖中 ${auctions.length}` : '点击展开 →'}
          </span>
        </div>
        <div className="text-[10px] text-gray-500 mt-1 text-left">
          交易地皮 · 拍卖 · 玩家转让
        </div>
      </button>

      {isOpen && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{ width: '1000px', height: '680px', maxWidth: '95vw', maxHeight: '92vh' }}
            className="bg-secondary rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-primary/50 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏛️</span>
                <span className="text-sm font-bold">房地产交易中心</span>
                <span className="text-xs text-gray-400">（交易 · 拍卖 · 转让 · 每7天拍卖）</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-lg">×</button>
            </div>

            <div className="flex-1 flex min-h-0">
              {/* 左：拍卖区 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-w-0">
                <div className="bg-amber-900/20 rounded-lg p-3 border border-amber-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🔨</span>
                    <span className="text-sm font-bold text-amber-300">当前拍卖</span>
                    <span className="text-[10px] text-gray-400">（每7天自动开始；下一轮约 {Math.max(0, 7 - Math.floor(daysSinceStart) % 7)} 天后）</span>
                  </div>
                  {auctions.length === 0 ? (
                    <div className="text-xs text-gray-400 py-3 text-center">📭 当前无拍卖 - 等待系统自动开始</div>
                  ) : (
                    <div className="space-y-2">
                      {auctions.map(c => (
                        <div key={c.id} className="bg-black/30 rounded p-2 text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <div>
                              <div className="font-bold text-amber-200">📍 {c.name}</div>
                              <div className="text-[10px] text-gray-400">基础价 ${c.basePrice.toLocaleString()} · 底价 ${(c.auctionReservedPrice || 0).toLocaleString()}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-amber-300 font-bold text-base">${(c.auctionHighestBid || 0).toLocaleString()}</div>
                              <div className="text-[10px] text-gray-400">最高出价</div>
                            </div>
                          </div>
                          <div className="text-[10px] text-gray-400 mb-2">
                            {c.auctionHighestBidder ? (
                              <>领先者：<span className="text-yellow-300 font-bold">{players.find(p => p.id === c.auctionHighestBidder)?.name}</span></>
                            ) : (
                              <span className="text-gray-500">暂无人出价</span>
                            )}
                          </div>
                          {c.owner !== myPlayerId && (
                            <button
                              type="button"
                              onClick={() => handleBid(c.id, c.auctionHighestBid || 0)}
                              className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded"
                            >
                              💰 出价（最低 ${Math.floor((c.auctionHighestBid || 0) * 1.1).toLocaleString()}）
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 我的地皮 */}
                <div className="bg-primary/60 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-bold">🏘️ 我的地皮（{myProps.length}块）</div>
                    <button
                      type="button"
                      onClick={handleUseSeizeCard}
                      className="text-[10px] px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded font-bold"
                      title="使用 200 💎 抢占一块非顶级地皮"
                    >
                      💎 占地卡（200💎）
                    </button>
                  </div>
                  {/* 站在交易所上的提示横幅 */}
                  {myPlayer?.position === 32 && myProps.length > 0 && (
                    <div className="mb-2 px-2 py-1.5 bg-purple-900/40 border border-purple-600/60 rounded text-[11px] text-purple-200">
                      🏛️ 你正站在房地产交易中心，可将自己的地皮<strong>卖给交易所</strong>换取现金（70% 回收）
                    </div>
                  )}
                  {myProps.length === 0 ? (
                    <div className="text-xs text-gray-400 py-2 text-center">暂无地皮</div>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {myProps.map(c => {
                        const levelMul = 1 + (c.level || 0) * 0.5
                        const rate = c.fromAuction ? 1.0 : 0.7
                        const salePrice = Math.max(
                          Math.floor(c.basePrice * levelMul * rate),
                          Math.floor(c.basePrice * 0.5)
                        )
                        return (
                          <div key={c.id} className={`bg-black/30 rounded p-2 text-xs ${c.fromAuction ? 'border border-yellow-500/50' : ''}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="font-bold">{c.name}</span>
                                  {c.fromAuction && <span className="text-[9px] bg-yellow-600 text-white px-1 rounded">拍卖 🏷️</span>}
                                  {c.upgrade === 'hotel' && <span className="text-[9px] bg-purple-600 text-white px-1 rounded">🏨酒店</span>}
                                  {c.upgrade === 'agency' && <span className="text-[9px] bg-blue-600 text-white px-1 rounded">🏢中介</span>}
                                </div>
                                <div className="text-[10px] text-gray-400">Lv.{c.level || 0} · ${(c.price || c.basePrice).toLocaleString()} · 卖交易所可获 <span className="text-green-300">${salePrice.toLocaleString()}</span></div>
                              </div>
                              <div className="flex gap-1">
                                {myPlayer?.position === 32 && !c.auctionActive && (
                                  <button
                                    type="button"
                                    onClick={() => handleSellToCenter(c.id)}
                                    className="text-[10px] px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded font-bold"
                                    title="卖给房地产交易中心（地皮变回空地）"
                                  >
                                    🏛️卖交易所
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleTrade(c.id)}
                                  disabled={c.fromAuction}
                                  className="text-[10px] px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={c.fromAuction ? '拍卖地皮不可交易' : '卖给其他玩家'}
                                >
                                  卖出
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-500 bg-black/20 rounded p-3">
                  <div className="font-bold text-gray-400 mb-1">💡 玩法说明</div>
                  <div>• <span className="text-amber-300">拍卖</span>：每7天自动开始，挑选3块最高价无主地皮；底价=基础价×50%，每次加价至少10%</div>
                  <div>• <span className="text-yellow-300">拍卖地皮</span>：永久免过路费；升级费用/建材减半；可无限升级到顶级</div>
                  <div>• <span className="text-purple-300">卖给交易所</span>：站在房地产交易中心可将自有地皮以 70%（拍卖地 100%）回收现金，地皮变回空地</div>
                  <div>• <span className="text-green-300">玩家交易</span>：可将自己普通地皮卖给其他玩家（拍卖地皮不可交易）</div>
                  <div>• <span className="text-red-300">占地卡</span>：200💎 抢占一块非顶级（Lv&lt;4）的他人地皮</div>
                  <div>• <span className="text-cyan-300">酒店buff</span>：拥有🏨酒店的玩家所有地皮费用+10%</div>
                </div>
              </div>

              {/* 右：所有玩家 */}
              <div className="w-72 border-l border-gray-700 bg-primary/40 flex flex-col">
                <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-400 font-bold">👥 玩家地皮</div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {players.map(p => {
                    const pProps = cells.filter(c => c.owner === p.id)
                    return (
                      <div key={p.id} className="bg-black/30 rounded p-2 border-l-2" style={{ borderColor: p.color }}>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="text-xs font-bold" style={{ color: p.color }}>{p.name}</span>
                          {p.id === myPlayerId && <span className="text-[9px] bg-yellow-600 text-white px-1 rounded">我</span>}
                          <span className="text-[9px] text-gray-500">{pProps.length}块</span>
                        </div>
                        <div className="space-y-0.5">
                          {pProps.slice(0, 6).map(c => (
                            <div key={c.id} className="text-[10px] flex items-center justify-between">
                              <span className="truncate">
                                {c.fromAuction && '🏷️'}{c.upgrade === 'hotel' && '🏨'}{c.upgrade === 'agency' && '🏢'} {c.name}
                              </span>
                              <span className="text-gray-500">Lv.{c.level || 0}</span>
                            </div>
                          ))}
                          {pProps.length > 6 && <div className="text-[10px] text-gray-500">+{pProps.length - 6} 更多...</div>}
                          {pProps.length === 0 && <div className="text-[10px] text-gray-500">无地皮</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}