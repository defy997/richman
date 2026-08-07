import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { createPortal } from 'react-dom'

export default function FuturesPanel() {
  const { futures, socket, players, myPlayerId } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedFutures, setSelectedFutures] = useState<string | null>(null)
  const [action, setAction] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState(1)

  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex)
  const isMyTurn = players[currentPlayerIndex]?.id === myPlayerId
  const myPlayer = players.find(p => p.id === myPlayerId)

  const handleTrade = () => {
    if (!selectedFutures || quantity < 1) return
    console.log('发送期货:', { symbol: selectedFutures, action, quantity })
    socket?.emit('tradeFutures', { symbol: selectedFutures, action, quantity })
    setQuantity(1)
  }

  const selected = futures.find(f => f.symbol === selectedFutures)
  const cost = selected ? selected.price * selected.unit * quantity : 0
  const fee = Math.floor(cost * 0.02)

  return (
    <>
      <div className="p-3">
        <div
          className="bg-primary rounded-lg p-2 cursor-pointer hover:bg-primary/80 transition-colors"
          onClick={(e) => { e.stopPropagation(); setIsOpen(true) }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛢️</span>
              <span className="text-sm font-bold">期货交易所</span>
            </div>
            <span className="text-gray-400 text-xs">点击展开 →</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-yellow-400">💎 {myPlayer?.diamonds || 0}</span>
            <span className="text-xs text-gray-500">存款: ${myPlayer?.deposit.toLocaleString()}</span>
          </div>
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
                <span className="text-xl">🛢️</span>
                <span className="text-sm font-bold">期货交易所</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-lg">×</button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 60px)' }}>
              <div>
                <div className="text-xs text-gray-400 mb-2">期货品种 (用存款交易)</div>
                <div className="grid grid-cols-4 gap-2">
                  {futures.map(f => (
                    <div
                      key={f.symbol}
                      onClick={() => { setSelectedFutures(f.symbol); setAction('buy') }}
                      style={{ cursor: 'pointer' }}
                      className={`
                        p-3 rounded-lg border transition-all hover:scale-102
                        ${f.change >= 0 ? 'border-green-700/50 bg-green-900/20' : 'border-red-700/50 bg-red-900/20'}
                        ${selectedFutures === f.symbol ? 'ring-2 ring-accent' : ''}
                      `}
                    >
                      <div className="text-[10px] text-gray-400">{f.symbol}</div>
                      <div className="text-sm font-bold">{f.name}</div>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-base font-bold">${f.price}</span>
                        <span className={`text-xs ${f.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {f.change >= 0 ? '+' : ''}{f.change.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500">每手 {f.unit}</div>
                    </div>
                  ))}
                </div>
              </div>

              {selected && (
                <div className="bg-primary rounded-lg p-4 border border-cyan-700/50 space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold">{selected.name}</div>
                      <div className="text-xs text-gray-400">每手 {selected.unit} 单位</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">${selected.price}</div>
                      <div className={`text-sm ${selected.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {selected.change >= 0 ? '+' : ''}{selected.change.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAction('buy')}
                      className={`py-2 rounded-lg font-bold ${action === 'buy' ? 'bg-cyan-600 text-white' : 'bg-gray-700'}`}
                    >
                      买入做多
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction('sell')}
                      className={`py-2 rounded-lg font-bold ${action === 'sell' ? 'bg-pink-600 text-white' : 'bg-gray-700'}`}
                    >
                      卖出做空
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>数量</span>
                      <span className="font-bold">{quantity}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[1, 2, 5, 10, 20].map(n => (
                        <button key={n} type="button" onClick={() => setQuantity(n)} className={`py-1 text-xs rounded ${quantity === n ? 'bg-cyan-600 text-white' : 'bg-gray-700'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-black/30 rounded p-2 text-xs space-y-1">
                    <div>💰 使用存款: <span className="text-red-400 font-bold">${(cost + fee).toLocaleString()}</span></div>
                    <div className="text-gray-500">(含2%手续费 ${fee})</div>
                    <div className="text-gray-500">预计盈亏: ±${Math.floor(cost * 0.15).toLocaleString()}</div>
                  </div>

                  <button
                    type="button"
                    onClick={handleTrade}
                    disabled={!isMyTurn || !myPlayer || myPlayer.deposit < cost + fee}
                    className={`w-full py-3 rounded-lg font-bold ${
                      isMyTurn && myPlayer && myPlayer.deposit >= cost + fee
                        ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white cursor-pointer hover:shadow-lg'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isMyTurn ? `确认${action === 'buy' ? '买入' : '卖出'}` : '等待回合'}
                  </button>
                </div>
              )}

              <div className="text-xs text-gray-500 bg-black/20 rounded p-3">
                <div className="font-bold text-gray-400 mb-1">💡 玩法说明</div>
                <div>• 用存款交易期货，盈亏自动折算为钻石</div>
                <div>• 每500元盈亏 = 1颗钻石</div>
                <div>• 风险与机遇并存，谨慎操作</div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
