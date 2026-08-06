import { useState } from 'react'
import { useGameStore, Stock } from '../store/gameStore'

export default function StockPanel() {
  const { stocks, socket, myPlayerId, players } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [action, setAction] = useState<'buy' | 'sell' | 'short' | 'cover'>('buy')
  const [quantity, setQuantity] = useState(1)
  const [leverage, setLeverage] = useState(1)

  const myPlayer = players.find(p => p.id === myPlayerId)
  const myStock = myPlayer?.stocks.find(s => s.symbol === selectedStock?.symbol)

  const handleTrade = () => {
    if (!selectedStock || quantity < 1) return
    socket?.emit('tradeStock', {
      symbol: selectedStock.symbol,
      action,
      quantity,
      leverage
    })
    setSelectedStock(null)
    setQuantity(1)
  }

  const formatChange = (change: number) => {
    const prefix = change >= 0 ? '+' : ''
    return `${prefix}${change.toFixed(2)}%`
  }

  return (
    <div className="bg-secondary rounded-xl p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="text-lg font-bold">股票市场</h2>
        <span className="text-gray-400">{isOpen ? '▼' : '▶'}</span>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-3">
          {/* Stock List */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {stocks.map(stock => (
              <div
                key={stock.symbol}
                onClick={() => setSelectedStock(stock)}
                className={`
                  p-2 rounded cursor-pointer transition-colors
                  ${selectedStock?.symbol === stock.symbol 
                    ? 'bg-accent/30 border border-accent' 
                    : 'bg-primary hover:bg-gray-700'}
                `}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold">{stock.symbol}</span>
                    <span className="text-gray-400 text-sm ml-2">{stock.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">${stock.price}</div>
                    <div className={`text-xs ${stock.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatChange(stock.change)}
                      {stock.trend && (
                        <span className="ml-1">
                          {stock.trend === 'up' ? '📈' : '📉'} {stock.trendDays}天
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Trade Panel */}
          {selectedStock && (
            <div className="bg-primary rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold">{selectedStock.symbol}</span>
                <span>当前价: ${selectedStock.price}</span>
              </div>

              <div className="grid grid-cols-4 gap-1">
                {(['buy', 'sell', 'short', 'cover'] as const).map(btn => (
                  <button
                    key={btn}
                    onClick={() => setAction(btn)}
                    className={`
                      py-1 text-xs rounded font-bold
                      ${action === btn 
                        ? btn === 'buy' ? 'bg-green-600' 
                          : btn === 'sell' ? 'bg-blue-600'
                          : btn === 'short' ? 'bg-orange-600'
                          : 'bg-purple-600'
                        : 'bg-gray-700'
                      }
                    `}
                  >
                    {btn === 'buy' ? '买入' : btn === 'sell' ? '卖出' : btn === 'short' ? '做空' : '平空'}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-sm text-gray-400">数量</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  className="w-full px-2 py-1 bg-secondary rounded text-white"
                />
              </div>

              {(action === 'buy' || action === 'short') && (
                <div>
                  <label className="text-sm text-gray-400">杠杆 (1-3)</label>
                  <input
                    type="range"
                    value={leverage}
                    onChange={e => setLeverage(parseInt(e.target.value))}
                    min={1}
                    max={3}
                    className="w-full"
                  />
                  <div className="text-center">{leverage}x</div>
                </div>
              )}

              <div className="text-sm text-gray-400">
                {action === 'buy' && `需支付: $${(selectedStock.price * quantity * leverage).toFixed(0)}`}
                {action === 'sell' && `持有: ${myStock?.quantity || 0} 股`}
                {action === 'short' && `需保证金: $${(selectedStock.price * quantity / leverage).toFixed(0)}`}
                {action === 'cover' && `做空: ${myStock?.shortQuantity || 0} 股`}
              </div>

              <button
                onClick={handleTrade}
                className="w-full py-2 bg-accent hover:bg-red-600 rounded font-bold"
              >
                确认{action === 'buy' ? '买入' : action === 'sell' ? '卖出' : action === 'short' ? '做空' : '平空'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
