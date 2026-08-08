import { useState, useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { createPortal } from 'react-dom'
import ReactECharts from 'echarts-for-react'

function FuturesChart({ futures }: { futures: any }) {
  const closes = futures.history.map((h: any) => h.close)
  const category = futures.history.map((_: any, i: number) => `D${i + 1}`)
  const candleData = futures.history.map((h: any) => [h.open, h.close, h.low, h.high])
  const volumes = futures.history.map((h: any) => h.volume)
  const volumeColors = futures.history.map((h: any) => h.close >= h.open ? '#fbbf24' : '#22c55e')

  const calcMA = (data: number[], period: number) => {
    const ma: (number | null)[] = []
    for (let i = 0; i < data.length; i++) {
      if (i + 1 < period) { ma.push(null); continue }
      let sum = 0
      for (let j = i + 1 - period; j <= i; j++) sum += data[j]
      ma.push(Math.round((sum / period) * 100) / 100)
    }
    return ma
  }
  const ma5 = calcMA(closes, 5)
  const ma10 = calcMA(closes, 10)

  const option = {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(0,0,0,0.85)',
      borderColor: '#374151',
      textStyle: { color: '#fff', fontSize: 10 },
    },
    grid: [
      { left: '8%', right: '4%', top: '10%', height: '60%' },
      { left: '8%', right: '4%', top: '75%', height: '18%' }
    ],
    xAxis: [
      { type: 'category', data: category, gridIndex: 0, axisLine: { lineStyle: { color: '#374151' } }, axisLabel: { show: false } },
      { type: 'category', data: category, gridIndex: 1, axisLine: { lineStyle: { color: '#374151' } }, axisLabel: { color: '#6b7280', fontSize: 9 } }
    ],
    yAxis: [
      { scale: true, gridIndex: 0, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { lineStyle: { color: '#1f2937' } }, axisLabel: { color: '#6b7280', fontSize: 9 } },
      { scale: true, gridIndex: 1, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { show: false }, axisLabel: { color: '#6b7280', fontSize: 9 } }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 50, end: 100 },
      { show: true, type: 'slider', xAxisIndex: [0, 1], bottom: 2, height: 16, start: 50, end: 100 }
    ],
    series: [
      { name: 'K线', type: 'candlestick', data: candleData, xAxisIndex: 0, yAxisIndex: 0,
        itemStyle: { color: '#fbbf24', color0: '#22c55e', borderColor: '#d97706', borderColor0: '#16a34a' } },
      { name: 'MA5', type: 'line', data: ma5, xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { width: 1, color: '#60a5fa' }, showSymbol: false },
      { name: 'MA10', type: 'line', data: ma10, xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { width: 1, color: '#a78bfa' }, showSymbol: false },
      { name: '量', type: 'bar', data: volumes.map((v: number, i: number) => ({ value: v, itemStyle: { color: volumeColors[i] } })), xAxisIndex: 1, yAxisIndex: 1 }
    ]
  }

  return <ReactECharts option={option} style={{ height: '280px', width: '100%' }} notMerge lazyUpdate={false} />
}

export default function FuturesPanel() {
  const { futures, socket, players, myPlayerId } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedFutures, setSelectedFutures] = useState<string | null>(null)
  const [action, setAction] = useState<'buy' | 'sell' | 'close'>('buy')
  const [quantity, setQuantity] = useState(1)

  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex)
  const isMyTurn = players[currentPlayerIndex]?.id === myPlayerId
  const myPlayer = players.find(p => p.id === myPlayerId)

  const handleTrade = () => {
    if (!selectedFutures || quantity < 1) return
    socket?.emit('tradeFutures', { symbol: selectedFutures, action, quantity })
    if (action !== 'close') setQuantity(1)
  }

  const selected = futures.find(f => f.symbol === selectedFutures)

  // 我的持仓
  const myHolding = (myPlayer?.futuresHoldings || []).find((h: any) => h.symbol === selectedFutures)

  const cost = selected ? selected.price * selected.unit * quantity : 0
  const fee = Math.floor(cost * 0.02)
  const initialMargin = Math.ceil(cost * 0.20)
  const maintenanceMargin = selected && myHolding
    ? Math.ceil(selected.price * selected.unit * myHolding.shortQuantity * 0.15)
    : 0

  // 浮动盈亏
  const floatingPnl = selected && myHolding ? (
    (myHolding.longQuantity > 0 ? (selected.price - myHolding.longAvgCost) * myHolding.longQuantity : 0) +
    (myHolding.shortQuantity > 0 ? (myHolding.shortAvgCost - selected.price) * myHolding.shortQuantity : 0)
  ) : 0

  const typeIcon = selected?.type === 'gold' ? '🥇' : selected?.type === 'silver' ? '🥈' : '💎'
  const typeColor = selected?.type === 'gold' ? 'from-yellow-500 to-yellow-700' : selected?.type === 'silver' ? 'from-gray-400 to-gray-600' : 'from-cyan-400 to-blue-600'

  // 钻石期货价 × 数量
  const diamondFut = futures.find(f => f.type === 'diamond')
  const diamondUnitPrice = diamondFut ? diamondFut.price : 5000
  const diamondCount = myPlayer?.diamonds || 0
  const diamondValue = diamondCount * diamondUnitPrice

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
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-yellow-400">💎 {diamondCount}</span>
              <span className="text-xs text-gray-500">存款: ${myPlayer?.deposit.toLocaleString()}</span>
            </div>
            <span className="text-[10px] text-gray-400">💎 ≈ ${Math.round(diamondValue).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {isOpen && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{ width: '900px', height: '700px', maxWidth: '95vw', maxHeight: '92vh' }}
            className="bg-secondary rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-primary/50 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛢️</span>
                <span className="text-sm font-bold">期货交易所</span>
                <span className="text-xs text-gray-400">(黄金/白银/钻石)</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-lg">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* 期货品种选择 */}
              <div>
                <div className="text-xs text-gray-400 mb-2">期货品种</div>
                <div className="grid grid-cols-3 gap-2">
                  {futures.map(f => (
                    <div
                      key={f.symbol}
                      onClick={() => { setSelectedFutures(f.symbol); setAction('buy') }}
                      style={{ cursor: 'pointer' }}
                      className={`
                        p-3 rounded-lg border-2 transition-all
                        bg-gradient-to-br ${typeColor}
                        ${selectedFutures === f.symbol ? 'ring-2 ring-white shadow-2xl scale-105' : 'border-gray-700'}
                      `}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-2xl">{f.type === 'gold' ? '🥇' : f.type === 'silver' ? '🥈' : '💎'}</span>
                        <span className="text-[10px] text-white/70">{f.symbol}</span>
                      </div>
                      <div className="text-white font-bold text-sm">{f.name}</div>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-white font-bold">${f.price}</span>
                        <span className={`text-xs ${f.change >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                          {f.change >= 0 ? '+' : ''}{f.change.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selected && (
                <div className="bg-primary rounded-lg p-4 border border-yellow-700/50 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl">{typeIcon}</span>
                      <div>
                        <div className="font-bold">{selected.name}</div>
                        <div className="text-xs text-gray-400">基础价 ${selected.base} · {selected.unit} 手/单位</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">${selected.price}</div>
                      <div className={`text-sm ${selected.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {selected.change >= 0 ? '+' : ''}{selected.change.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {selected.eventDesc !== '无重大事件' && (
                    <div className="text-xs bg-orange-900/30 text-orange-400 rounded p-2">
                      📢 {selected.eventDesc}（剩余 {selected.eventDays} 天）
                    </div>
                  )}

                  <div className="bg-black/30 rounded-lg overflow-hidden">
                    <FuturesChart futures={selected} />
                  </div>

                  {/* 持仓显示 */}
                  {myHolding && (myHolding.longQuantity > 0 || myHolding.shortQuantity > 0) && (
                    <div className="bg-black/30 rounded p-2">
                      <div className="text-[10px] text-gray-400 mb-1">我的持仓</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {myHolding.longQuantity > 0 && (
                          <div>
                            <span className="text-green-400">多 {myHolding.longQuantity}</span> @ ${myHolding.longAvgCost.toFixed(2)}
                          </div>
                        )}
                        {myHolding.shortQuantity > 0 && (
                          <div>
                            <span className="text-orange-400">空 {myHolding.shortQuantity}</span> @ ${myHolding.shortAvgCost.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div className="text-xs mt-1">
                        浮动盈亏: <span className={floatingPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {floatingPnl >= 0 ? '+' : ''}${Math.round(floatingPnl).toLocaleString()}
                        </span>
                      </div>
                      {myHolding.shortQuantity > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-700 text-[11px] space-y-0.5">
                          <div className="flex justify-between"><span className="text-gray-400">初始保证金</span><span className="text-orange-300">${Math.round(myHolding.shortInitialMargin || 0).toLocaleString()}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">维持保证金</span><span className={floatingPnl + (myHolding.shortInitialMargin || 0) < maintenanceMargin ? 'text-red-400 font-bold' : 'text-yellow-300'}>${maintenanceMargin.toLocaleString()}</span></div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAction('buy')}
                      className={`py-2 rounded-lg font-bold text-sm ${
                        action === 'buy' ? 'bg-green-600 text-white' : 'bg-gray-700'
                      }`}
                    >
                      做多
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction('sell')}
                      className={`py-2 rounded-lg font-bold text-sm ${
                        action === 'sell' ? 'bg-orange-600 text-white' : 'bg-gray-700'
                      }`}
                    >
                      做空
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction('close')}
                      disabled={!myHolding || (myHolding.longQuantity === 0 && myHolding.shortQuantity === 0)}
                      className={`py-2 rounded-lg font-bold text-sm ${
                        action === 'close' ? 'bg-purple-600 text-white' : 'bg-gray-700'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      平仓
                    </button>
                  </div>

                  {action !== 'close' && (
                    <>
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>数量（手）</span>
                          <span className="font-bold">{quantity}</span>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {[1, 2, 5, 10, 20].map(n => (
                            <button key={n} type="button" onClick={() => setQuantity(n)} className={`py-1 text-xs rounded ${quantity === n ? 'bg-accent text-white' : 'bg-gray-700'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-black/30 rounded p-2 text-xs space-y-1">
                        <div>{action === 'sell' ? '🔒 初始保证金' : '💰 占用资金'}: <span className="text-red-400 font-bold">${(action === 'sell' ? initialMargin + fee : cost + fee).toLocaleString()}</span></div>
                        {action === 'sell' && <div>⚠️ 维持保证金: <span className="text-yellow-300 font-bold">${Math.ceil(cost * 0.15).toLocaleString()}</span></div>}
                        <div className="text-gray-500">（含2%手续费 ${fee}；触及维持保证金将强制平仓）</div>
                      </div>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleTrade}
                    disabled={!isMyTurn || (action !== 'close' && (!myPlayer || myPlayer.cash + myPlayer.deposit < (action === 'sell' ? initialMargin + fee : cost + fee))) || (action === 'close' && (!myHolding || (myHolding.longQuantity === 0 && myHolding.shortQuantity === 0)))}
                    className={`w-full py-3 rounded-lg font-bold transition-all ${
                      isMyTurn && ((action === 'close') || (myPlayer && myPlayer.cash + myPlayer.deposit >= (action === 'sell' ? initialMargin + fee : cost + fee)))
                        ? action === 'buy' ? 'bg-gradient-to-r from-green-600 to-green-800 text-white cursor-pointer hover:shadow-lg' :
                          action === 'sell' ? 'bg-gradient-to-r from-orange-600 to-orange-800 text-white cursor-pointer hover:shadow-lg' :
                          'bg-gradient-to-r from-purple-600 to-purple-800 text-white cursor-pointer hover:shadow-lg'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isMyTurn
                      ? (action === 'buy' ? `✅ 做多 ${quantity} 手` :
                         action === 'sell' ? `📉 做空 ${quantity} 手` :
                         `🔄 平仓所有持仓`)
                      : '等待回合'}
                  </button>
                </div>
              )}

              <div className="text-xs text-gray-500 bg-black/20 rounded p-3">
                <div className="font-bold text-gray-400 mb-1">💡 玩法说明</div>
                <div>• <span className="text-yellow-300">黄金/白银/钻石</span> 三种期货，价格实时波动</div>
                <div>• <span className="text-green-400">做多</span>: 价格上涨时盈利，下跌亏损</div>
                <div>• <span className="text-orange-400">做空</span>: 只冻结名义价值20%的初始保证金，价格上涨导致权益低于15%维持保证金时强制平仓</div>
                <div>• <span className="text-purple-400">平仓</span>: 结算所有持仓的浮动盈亏</div>
                <div>• 盈亏实时结算，资金从现金+存款自动扣</div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}