import { useState, useMemo, useEffect } from 'react'
import { useGameStore, Stock } from '../store/gameStore'
import { createPortal } from 'react-dom'

// K线图组件
function KLineChart({ kline, currentPrice }: { kline: number[]; currentPrice: number }) {
  const data = [...kline, currentPrice]
  if (data.length < 2) return <div className="text-gray-500 text-xs">数据不足</div>

  const min = Math.min(...data) * 0.98
  const max = Math.max(...data) * 1.02
  const range = max - min || 1

  const h = 120
  const w = 280
  const step = w / (data.length - 1)

  const points = data.map((v, i) => ({
    x: i * step,
    y: h - ((v - min) / range) * h
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = linePath + ` L ${points[points.length - 1].x} ${h} L 0 ${h} Z`

  const isUp = data[data.length - 1] >= data[0]
  const color = isUp ? '#22c55e' : '#ef4444'

  return (
    <svg width={w} height={h} className="mx-auto">
      <defs>
        <linearGradient id="klineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(r => (
        <line key={r} x1="0" y1={h * r} x2={w} y2={h * r} stroke="#374151" strokeWidth="0.5" />
      ))}
      <path d={areaPath} fill="url(#klineGrad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill={color} />
      <text x={w - 5} y={points[points.length - 1].y - 5} fill={color} fontSize="10" textAnchor="end">
        ${data[data.length - 1]}
      </text>
    </svg>
  )
}

export default function StockPanel() {
  const { stocks, socket, players, myPlayerId } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [action, setAction] = useState<'buy' | 'sell' | 'short' | 'cover'>('buy')
  const [quantity, setQuantity] = useState(1)
  const [leverage, setLeverage] = useState(1)
  const [selectedSector, setSelectedSector] = useState<string>('全部')

  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex)
  const isMyTurn = players[currentPlayerIndex]?.id === myPlayerId
  const myPlayer = players.find(p => p.id === myPlayerId)

  const sectors = useMemo(() => {
    const s = new Set(stocks.map(st => st.sector))
    return ['全部', ...Array.from(s)]
  }, [stocks])

  const filteredStocks = useMemo(() => {
    if (selectedSector === '全部') return stocks
    return stocks.filter(s => s.sector === selectedSector)
  }, [stocks, selectedSector])

  const myStock = myPlayer?.stocks.find(s => s.symbol === selectedStock?.symbol)

  const handleTrade = () => {
    if (!selectedStock || quantity < 1) return
    console.log('发送交易:', { symbol: selectedStock.symbol, action, quantity, leverage })
    socket?.emit('tradeStock', { symbol: selectedStock.symbol, action, quantity, leverage })
    setQuantity(1)
  }

  const formatChange = (change: number) => {
    const prefix = change >= 0 ? '+' : ''
    return `${prefix}${change.toFixed(2)}%`
  }

  const allHoldings = useMemo(() => {
    if (!selectedStock) return []
    return players
      .filter(p => {
        const h = p.stocks.find(s => s.symbol === selectedStock.symbol)
        return h && (h.quantity > 0 || (h.shortQuantity || 0) > 0)
      })
      .map(p => ({
        player: p,
        holding: p.stocks.find(s => s.symbol === selectedStock.symbol)!
      }))
  }, [players, selectedStock])

  return (
    <>
      {/* 触发按钮 */}
      <div className="p-3">
        <div
          className="bg-primary rounded-lg p-2 cursor-pointer hover:bg-primary/80 transition-colors"
          onClick={(e) => { e.stopPropagation(); setIsOpen(true) }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📈</span>
              <span className="text-sm font-bold">股票市场</span>
            </div>
            <span className="text-gray-400 text-xs">点击展开 →</span>
          </div>
          <div className="flex gap-2 mt-1 overflow-x-auto">
            {stocks.slice(0, 8).map(s => (
              <div key={s.symbol} className={`text-[10px] px-1.5 py-0.5 rounded ${s.change >= 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                {s.name} {s.change >= 0 ? '+' : ''}{s.change.toFixed(1)}%
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 浮层 - 用 Portal 挂到 body 避免 stacking 问题 */}
      {isOpen && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{ width: '900px', height: '600px', maxWidth: '95vw', maxHeight: '90vh' }}
            className="bg-secondary rounded-xl shadow-2xl flex overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* 左侧：板块选择 */}
            <div className="w-32 bg-primary/50 border-r border-gray-700 flex flex-col flex-shrink-0">
              <div className="p-2 border-b border-gray-700 text-xs text-gray-400">板块</div>
              <div className="flex-1 overflow-y-auto">
                {sectors.map(sector => (
                  <button
                    key={sector}
                    onClick={() => { setSelectedSector(sector); setSelectedStock(null) }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                      selectedSector === sector
                        ? 'bg-accent text-white'
                        : 'hover:bg-gray-700 text-gray-300'
                    }`}
                  >
                    {sector}
                  </button>
                ))}
              </div>
            </div>

            {/* 中间：股票列表 */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="grid grid-cols-6 gap-1 p-2 bg-primary/50 text-[10px] text-gray-400 font-bold border-b border-gray-700">
                <div>代码</div>
                <div>名称</div>
                <div className="text-right">现价</div>
                <div className="text-right">涨跌</div>
                <div className="text-right">总持仓</div>
                <div className="text-right">我的</div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredStocks.map(stock => {
                  const h = myPlayer?.stocks.find(s => s.symbol === stock.symbol)
                  const allH = players.reduce((sum, p) => {
                    const ph = p.stocks.find(s => s.symbol === stock.symbol)
                    return sum + (ph?.quantity || 0) + (ph?.shortQuantity || 0)
                  }, 0)
                  return (
                    <div
                      key={stock.symbol}
                      onClick={() => { setSelectedStock(stock); setAction('buy'); setQuantity(1) }}
                      style={{ cursor: 'pointer' }}
                      className={`
                        grid grid-cols-6 gap-1 p-2 text-xs border-b border-gray-800
                        hover:bg-gray-800/50 transition-colors
                        ${stock.limitUp ? 'bg-orange-900/20' : stock.limitDown ? 'bg-blue-900/20' : ''}
                        ${selectedStock?.symbol === stock.symbol ? 'bg-accent/30' : ''}
                      `}
                    >
                      <div className="text-gray-400">{stock.symbol}</div>
                      <div className="font-bold truncate">{stock.name}</div>
                      <div className="text-right font-bold">${stock.price}</div>
                      <div className={`text-right ${stock.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatChange(stock.change)}
                        {stock.limitUp && <span className="ml-1 text-orange-400">涨停</span>}
                        {stock.limitDown && <span className="ml-1 text-blue-400">跌停</span>}
                      </div>
                      <div className="text-right text-yellow-400">{allH}</div>
                      <div className="text-right">
                        {(h?.quantity || 0) > 0 && <span className="text-green-400">多{h?.quantity}</span>}
                        {(h?.shortQuantity || 0) > 0 && <span className="text-orange-400 ml-1">空{h?.shortQuantity}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {selectedStock?.news && (
                <div className="p-2 bg-primary/30 border-t border-gray-700 text-xs text-yellow-400">
                  {selectedStock.news}
                </div>
              )}
            </div>

            {/* 右侧：详情/交易 */}
            <div className="w-72 bg-primary/30 border-l border-gray-700 flex flex-col flex-shrink-0">
              <div className="p-2 border-b border-gray-700 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300">股票详情</span>
                <button onClick={() => setIsOpen(false)} className="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center">×</button>
              </div>

              {selectedStock ? (
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  <div>
                    <div className="text-sm font-bold">{selectedStock.name}</div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-2xl font-bold">${selectedStock.price}</span>
                      <span className={`text-sm ${selectedStock.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatChange(selectedStock.change)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {selectedStock.sector} · {selectedStock.symbol}
                    </div>
                  </div>

                  <div className="bg-black/30 rounded-lg p-2">
                    <div className="text-[10px] text-gray-400 mb-1">K线 (近30日)</div>
                    <KLineChart kline={selectedStock.kline || []} currentPrice={selectedStock.price} />
                  </div>

                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">玩家持仓</div>
                    {allHoldings.length > 0 ? (
                      <div className="space-y-1">
                        {allHoldings.map(({ player, holding }) => (
                          <div key={player.id} className="flex items-center justify-between text-[10px] bg-black/30 rounded px-2 py-1">
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.color }} />
                              <span className={player.id === myPlayerId ? 'text-accent' : 'text-gray-300'}>{player.name}</span>
                            </div>
                            <div className="flex gap-2">
                              {holding.quantity > 0 && <span className="text-green-400">多{holding.quantity}</span>}
                              {(holding.shortQuantity || 0) > 0 && <span className="text-orange-400">空{holding.shortQuantity}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">无人持仓</div>
                    )}
                  </div>

                  {myStock && (myStock.quantity > 0 || (myStock.shortQuantity || 0) > 0) && (
                    <div className="bg-black/30 rounded p-2">
                      <div className="text-[10px] text-gray-400 mb-1">我的持仓</div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>多头: <span className="text-green-400">{myStock.quantity}</span></div>
                        <div>空头: <span className="text-orange-400">{myStock.shortQuantity || 0}</span></div>
                        <div>成本: <span className="text-gray-300">${myStock.avgCost.toFixed(0)}</span></div>
                        <div>浮动: <span className={((selectedStock.price - myStock.avgCost) * myStock.quantity) >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {((selectedStock.price - myStock.avgCost) * myStock.quantity) >= 0 ? '+' : ''}
                          ${((selectedStock.price - myStock.avgCost) * myStock.quantity).toFixed(0)}
                        </span></div>
                      </div>
                    </div>
                  )}

                  {/* 交易操作 */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-1">
                      {(['buy', 'sell', 'short', 'cover'] as const).map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAction(a)}
                          className={`py-1 text-[10px] rounded font-bold ${
                            action === a
                              ? a === 'buy' ? 'bg-green-600 text-white' : a === 'sell' ? 'bg-blue-600 text-white' : a === 'short' ? 'bg-orange-600 text-white' : 'bg-purple-600 text-white'
                              : 'bg-gray-700 text-gray-400'
                          }`}
                        >
                          {a === 'buy' ? '买入' : a === 'sell' ? '卖出' : a === 'short' ? '做空' : '平空'}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-1">
                      {[1, 10, 50, 100].map(n => (
                        <button key={n} type="button" onClick={() => setQuantity(n)} className={`flex-1 py-1 text-[10px] rounded ${quantity === n ? 'bg-accent text-white' : 'bg-gray-700'}`}>
                          {n}
                        </button>
                      ))}
                    </div>

                    {(action === 'buy' || action === 'short') && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">杠杆</span>
                        <input type="range" value={leverage} onChange={e => setLeverage(parseInt(e.target.value))} min={1} max={3} className="flex-1" />
                        <span className="text-[10px] font-bold w-6">{leverage}x</span>
                      </div>
                    )}

                    <div className="bg-black/30 rounded p-2 text-[10px] space-y-0.5">
                      {action === 'buy' && <div>💰 需支付: <span className="text-red-400">${(selectedStock.price * quantity * leverage).toLocaleString()}</span></div>}
                      {action === 'sell' && <div>💵 获得: <span className="text-green-400">${(selectedStock.price * quantity).toLocaleString()}</span></div>}
                      {action === 'short' && <>
                        <div>💵 获得: <span className="text-green-400">${(selectedStock.price * quantity).toLocaleString()}</span></div>
                        <div>🔒 保证金(存款): <span className="text-yellow-400">${(selectedStock.price * quantity / leverage).toLocaleString()}</span></div>
                      </>}
                      {action === 'cover' && <div>💰 平仓: <span className="text-red-400">${(selectedStock.price * quantity).toLocaleString()}</span></div>}
                    </div>

                    <button
                      type="button"
                      onClick={handleTrade}
                      disabled={!isMyTurn || (action === 'buy' && selectedStock.limitUp) || (action === 'sell' && selectedStock.limitDown)}
                      className={`w-full py-2 rounded-lg font-bold text-sm ${
                        isMyTurn && !((action === 'buy' && selectedStock.limitUp) || (action === 'sell' && selectedStock.limitDown))
                          ? 'bg-gradient-to-r from-accent to-red-600 text-white cursor-pointer hover:shadow-lg'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isMyTurn
                        ? ((action === 'buy' && selectedStock.limitUp) ? '涨停禁止买入' :
                           (action === 'sell' && selectedStock.limitDown) ? '跌停禁止卖出' :
                           `确认${action === 'buy' ? '买入' : action === 'sell' ? '卖出' : action === 'short' ? '做空' : '平空'}`)
                        : '等待回合'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">
                  点击左侧股票查看详情
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
