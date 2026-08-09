import { useState, useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { createPortal } from 'react-dom'

interface CardInfo {
  name: string
  price: number
  desc: string
  icon: string
  color: string
}

const CARDS: CardInfo[] = [
  { name: '停留卡', price: 40, desc: '让下一个玩家停留一回合', icon: '⏸️', color: 'from-blue-600 to-blue-800' },
  { name: '骰子卡', price: 30, desc: '指定下一次骰子点数 (1-6)', icon: '🎲', color: 'from-purple-600 to-purple-800' },
  { name: '均贫卡', price: 100, desc: '所有玩家现金取平均值', icon: '⚖️', color: 'from-yellow-600 to-yellow-800' },
  { name: '红心卡', price: 60, desc: '指定股票/期货 散户/机构/游资/量化 看多倾向 +25% (4天)', icon: '❤️', color: 'from-pink-600 to-pink-800' },
  { name: '黑心卡', price: 80, desc: '指定股票/期货 散户/机构/游资/量化 看空倾向 +30% (5天)', icon: '🖤', color: 'from-gray-700 to-gray-900' },
  { name: '占地卡', price: 120, desc: '随机占领一块无人地皮', icon: '🚩', color: 'from-red-600 to-red-800' },
  { name: '地皮升级卡', price: 60, desc: '自动升级一块地皮', icon: '⬆️', color: 'from-green-600 to-green-800' },
  { name: '护盾卡', price: 100, desc: '让自己持仓的股票/期货在下次被卡牌影响时免疫', icon: '🛡️', color: 'from-cyan-600 to-cyan-800' },
  { name: '谣言卡', price: 50, desc: '对股票/期货散布利好/利空消息（仅在交易所或有同花顺可看）', icon: '📢', color: 'from-yellow-700 to-amber-900' }
]

export default function CardPanel() {
  const { socket, myPlayerId, players, stocks, futures } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<CardInfo | null>(null)
  const [targetValue, setTargetValue] = useState('')
  const [rumorDirection, setRumorDirection] = useState<'good' | 'bad' | null>(null)

  const myPlayer = players.find(p => p.id === myPlayerId)
  const myCards = myPlayer?.cards || []
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex)
  const isMyTurn = players[currentPlayerIndex]?.id === myPlayerId

  // 钻石期货价 × 数量
  const diamondPrice = useMemo(() => {
    const f = futures.find(x => x.type === 'diamond')
    return f ? f.price : 5000
  }, [futures])
  const diamondCount = myPlayer?.diamonds || 0
  const diamondValue = diamondCount * diamondPrice

  const handleBuyCard = (cardName: string) => {
    socket?.emit('buyCard', { cardName })
  }

  const handleUseCard = () => {
    if (!selectedCard) return
    if (selectedCard.name === '骰子卡') {
      const n = parseInt(targetValue)
      if (n < 1 || n > 6) return
      socket?.emit('useCard', { cardName: selectedCard.name, target: n })
    } else if (selectedCard.name === '红心卡' || selectedCard.name === '黑心卡' ||
               selectedCard.name === '护盾卡') {
      if (!targetValue) return
      socket?.emit('useCard', { cardName: selectedCard.name, target: targetValue })
    } else if (selectedCard.name === '谣言卡') {
      if (!targetValue || !rumorDirection) return
      socket?.emit('useCard', { cardName: selectedCard.name, target: `${targetValue}:${rumorDirection}` })
    } else {
      socket?.emit('useCard', { cardName: selectedCard.name })
    }
    setSelectedCard(null)
    setTargetValue('')
    setRumorDirection(null)
  }

  return (
    <>
      <div className="p-3">
        <div
          className="bg-primary rounded-lg p-2 cursor-pointer hover:bg-primary/80 transition-colors"
          onClick={(e) => { e.stopPropagation(); setIsOpen(true) }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎴</span>
              <span className="text-sm font-bold">卡片</span>
            </div>
            <div className="text-right">
              <div className="text-xs text-yellow-400">💎 {diamondCount}</div>
              <div className="text-[10px] text-gray-400">≈ ${Math.round(diamondValue).toLocaleString()}</div>
            </div>
          </div>
          {myCards.length > 0 && (
            <div className="mt-1 text-xs text-gray-400">
              持有 {myCards.length} 张卡片
            </div>
          )}
        </div>
      </div>

      {isOpen && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{ width: '700px', maxWidth: '95vw', maxHeight: '90vh' }}
            className="bg-secondary rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-primary/50 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎴</span>
                <span className="text-sm font-bold">卡片售卖机</span>
                <div className="text-right">
                  <div className="text-xs text-yellow-400">💎 {diamondCount}</div>
                  <div className="text-[10px] text-gray-400">≈ ${Math.round(diamondValue).toLocaleString()}</div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-lg">×</button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 60px)' }}>
              {myCards.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 mb-2">我的卡片 ({myCards.length})</div>
                  <div className="flex flex-wrap gap-2">
                    {myCards.map((cardName, idx) => {
                      const card = CARDS.find(c => c.name === cardName)
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => { setSelectedCard(card || null); setTargetValue(''); setRumorDirection(null) }}
                          className={`
                            px-3 py-2 rounded-lg text-xs font-bold border-2
                            ${selectedCard?.name === cardName
                              ? 'bg-accent border-white text-white'
                              : 'bg-primary border-gray-600 hover:border-accent'}
                          `}
                        >
                          {card?.icon} {cardName}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {selectedCard && myCards.includes(selectedCard.name) && (
                <div className="bg-primary rounded-lg p-4 border-2 border-accent space-y-3">
                  <div className="font-bold text-accent flex items-center gap-2">
                    <span className="text-2xl">{selectedCard.icon}</span>
                    使用：{selectedCard.name}
                  </div>

                  {selectedCard.name === '骰子卡' && (
                    <div>
                      <div className="text-xs text-gray-400 mb-2">选择骰子点数</div>
                      <div className="grid grid-cols-6 gap-2">
                        {[1, 2, 3, 4, 5, 6].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setTargetValue(String(n))}
                            className={`py-3 rounded-lg font-bold text-xl ${
                              targetValue === String(n) ? 'bg-accent text-white' : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedCard.name === '红心卡' || selectedCard.name === '黑心卡' ||
                    selectedCard.name === '护盾卡') && (
                    <div>
                      <div className="text-xs text-gray-400 mb-2">选择股票（不支持期货）</div>
                      <div className="text-[10px] text-gray-500 mb-2">
                        {selectedCard.name === '护盾卡' && '⚠️ 仅可选择自己已持仓的目标'}
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {stocks.map(s => (
                          <button
                            key={s.symbol}
                            type="button"
                            onClick={() => setTargetValue(s.symbol)}
                            className={`py-2 text-xs rounded ${
                              targetValue === s.symbol ? 'bg-accent text-white' : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                          >
                            {s.symbol} {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCard.name === '谣言卡' && (
                    <div>
                      <div className="text-xs text-gray-400 mb-2">第 1 步：选择股票</div>
                      <div className="text-[10px] text-yellow-500 mb-2">
                        📢 散布该股票的利好/利空消息，引诱其他玩家交易（不支持期货）
                      </div>
                      <div className="grid grid-cols-4 gap-1 mb-4">
                        {stocks.map(s => (
                          <button
                            key={s.symbol}
                            type="button"
                            onClick={() => setTargetValue(s.symbol)}
                            className={`py-2 text-xs rounded ${
                              targetValue === s.symbol ? 'bg-accent text-white' : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                          >
                            {s.symbol} {s.name}
                          </button>
                        ))}
                      </div>

                      {targetValue && (
                        <>
                          <div className="text-xs text-gray-400 mb-2">第 2 步：选择消息方向</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setRumorDirection('good')}
                              className={`py-3 rounded-lg text-sm font-bold transition-all ${
                                rumorDirection === 'good'
                                  ? 'bg-gradient-to-br from-green-600 to-green-800 ring-2 ring-white text-white'
                                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                              }`}
                            >
                              🟢 散布利好
                            </button>
                            <button
                              type="button"
                              onClick={() => setRumorDirection('bad')}
                              className={`py-3 rounded-lg text-sm font-bold transition-all ${
                                rumorDirection === 'bad'
                                  ? 'bg-gradient-to-br from-red-600 to-red-800 ring-2 ring-white text-white'
                                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                              }`}
                            >
                              🔴 散布利空
                            </button>
                          </div>
                          <div className="text-[10px] text-gray-500 mt-2 italic">
                            ⚠️ 消息内容仅在股票/期货交易所或购买同花顺软件可查看
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleUseCard}
                    disabled={(() => {
                      if (selectedCard.name === '骰子卡') return !targetValue
                      if (selectedCard.name === '红心卡' || selectedCard.name === '黑心卡' ||
                          selectedCard.name === '护盾卡') return !targetValue
                      if (selectedCard.name === '谣言卡') return !targetValue || !rumorDirection
                      return false
                    })()}
                    className={`w-full py-3 rounded-lg font-bold transition-all ${
                      (() => {
                        if (selectedCard.name === '停留卡' || selectedCard.name === '均贫卡' ||
                            selectedCard.name === '地皮升级卡' || selectedCard.name === '占地卡') {
                          return true
                        }
                        if (selectedCard.name === '谣言卡') return !!targetValue && !!rumorDirection
                        return !!targetValue || (selectedCard.name === '骰子卡' && !!targetValue)
                      })()
                        ? 'bg-accent hover:bg-red-600 text-white cursor-pointer'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    ✓ 使用卡片
                  </button>
                </div>
              )}

              <div>
                <div className="text-xs text-gray-400 mb-2">商店 (点击购买)</div>
                <div className="grid grid-cols-4 gap-2">
                  {CARDS.map(card => {
                    const canBuy = myPlayer && myPlayer.diamonds >= card.price && isMyTurn
                    return (
                      <button
                        key={card.name}
                        type="button"
                        onClick={() => handleBuyCard(card.name)}
                        disabled={!canBuy}
                        className={`
                          relative p-3 rounded-lg text-left transition-all
                          bg-gradient-to-br ${card.color}
                          ${canBuy
                            ? 'hover:scale-105 hover:shadow-xl cursor-pointer'
                            : 'opacity-50 cursor-not-allowed'}
                        `}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-2xl">{card.icon}</span>
                          <span className="text-xs font-bold text-yellow-300">💎{card.price}</span>
                        </div>
                        <div className="font-bold text-white text-xs">{card.name}</div>
                        <div className="text-[10px] text-white/70 truncate">{card.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {!isMyTurn && myPlayer && (
                <div className="text-xs text-center text-gray-500">
                  ⏳ 等待你的回合才能购买
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}