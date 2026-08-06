import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

const CARDS = {
  '停留卡': { price: 40, desc: '停留在原地一回合' },
  '骰子卡': { price: 30, desc: '指定下次骰出的点数' },
  '均贫卡': { price: 100, desc: '所有玩家现金取平均值' },
  '红心卡': { price: 60, desc: '指定股票连续上涨3天' },
  '黑心卡': { price: 80, desc: '指定股票连续下跌4天' },
  '占地卡': { price: 120, desc: '随机占领一块无人地皮' },
  '地皮升级卡': { price: 60, desc: '指定一块自己的地皮升级' }
} as const

export default function CardPanel() {
  const { socket, myPlayerId, players } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [targetValue, setTargetValue] = useState<string>('')

  const myPlayer = players.find(p => p.id === myPlayerId)
  const myCards = myPlayer?.cards || []

  const handleBuyCard = (cardName: string) => {
    const card = CARDS[cardName as keyof typeof CARDS]
    if (!card) return
    
    if (myPlayer && myPlayer.diamonds < card.price) {
      return
    }
    
    socket?.emit('buyCard', { cardName })
  }

  const handleUseCard = (cardName: string) => {
    const card = CARDS[cardName as keyof typeof CARDS]
    if (!card) return

    if (cardName === '骰子卡') {
      const diceValue = parseInt(targetValue)
      if (diceValue < 1 || diceValue > 6) return
      socket?.emit('useCard', { cardName, target: diceValue })
    } else if (cardName === '红心卡' || cardName === '黑心卡') {
      if (!targetValue) return
      socket?.emit('useCard', { cardName, target: targetValue })
    } else {
      socket?.emit('useCard', { cardName })
    }
    setSelectedCard(null)
    setTargetValue('')
  }

  return (
    <div className="bg-secondary rounded-xl p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="text-lg font-bold">卡片商店</h2>
        <span className="text-gray-400">{isOpen ? '▼' : '▶'}</span>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-4">
          {/* My Cards */}
          {myCards.length > 0 && (
            <div>
              <h3 className="text-sm text-gray-400 mb-2">我的卡片</h3>
              <div className="flex flex-wrap gap-2">
                {myCards.map((cardName, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedCard(selectedCard === cardName ? null : cardName)}
                    className={`
                      px-3 py-1 rounded-full text-sm font-bold
                      ${selectedCard === cardName 
                        ? 'bg-accent text-white' 
                        : 'bg-gray-700 hover:bg-gray-600'}
                    `}
                  >
                    {cardName}
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        handleUseCard(cardName)
                      }}
                      className="ml-2 text-xs bg-white/20 px-1 rounded"
                    >
                      使用
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Card Target Input */}
          {selectedCard && ['骰子卡', '红心卡', '黑心卡'].includes(selectedCard) && (
            <div className="bg-primary rounded-lg p-3 space-y-2">
              <label className="text-sm">
                {selectedCard === '骰子卡' ? '输入骰子点数 (1-6)' : '输入股票代码'}
              </label>
              {selectedCard === '骰子卡' ? (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5, 6].map(num => (
                    <button
                      key={num}
                      onClick={() => handleUseCard('骰子卡')}
                      className="flex-1 py-2 bg-gray-700 hover:bg-accent rounded font-bold"
                    >
                      {num}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  value={targetValue}
                  onChange={e => setTargetValue(e.target.value.toUpperCase())}
                  placeholder="股票代码"
                  className="w-full px-3 py-2 bg-secondary rounded"
                />
              )}
            </div>
          )}

          {/* Card Shop */}
          <div>
            <h3 className="text-sm text-gray-400 mb-2">商店</h3>
            <div className="space-y-2">
              {Object.entries(CARDS).map(([name, card]) => (
                <div 
                  key={name}
                  className="bg-primary rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold">{name}</div>
                    <div className="text-xs text-gray-400">{card.desc}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gold font-bold">{card.price}💎</span>
                    <button
                      onClick={() => handleBuyCard(name)}
                      disabled={myPlayer && myPlayer.diamonds < card.price}
                      className={`
                        px-3 py-1 rounded text-sm font-bold
                        ${myPlayer && myPlayer.diamonds >= card.price
                          ? 'bg-accent hover:bg-red-600 text-white'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
                      `}
                    >
                      购买
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
