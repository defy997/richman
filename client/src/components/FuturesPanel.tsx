import { useState, useMemo, memo } from 'react'
import { useGameStore } from '../store/gameStore'
import { createPortal } from 'react-dom'
import ReactECharts from 'echarts-for-react'

const FuturesChart = memo(function FuturesChart({ futures }: { futures: any }) {
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

  const option = useMemo(() => ({
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
  }), [closes.length, futures.symbol])

  return <ReactECharts option={option} style={{ height: '280px', width: '100%' }} notMerge lazyUpdate={false} />
})

export default function FuturesPanel() {
  const { futures, socket, players, myPlayerId } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedFutures, setSelectedFutures] = useState<string | null>(null)
  const [action, setAction] = useState<'buy' | 'sell' | 'close' | 'exchange' | 'delivery'>('buy')
  const [quantity, setQuantity] = useState(1)
  const [leverage, setLeverage] = useState(1)
  const [filterCategory, setFilterCategory] = useState<'all' | 'precious' | 'material' | 'energy' | 'agriculture'>('all')

  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex)
  const isMyTurn = players[currentPlayerIndex]?.id === myPlayerId
  const myPlayer = players.find(p => p.id === myPlayerId)

  const handleTrade = () => {
    if (!selectedFutures || quantity < 1) return
    socket?.emit('tradeFutures', { symbol: selectedFutures, action, quantity, leverage })
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

  const typeIcon = (t?: string) => {
    switch (t) {
      case 'gold':     return '🥇'
      case 'silver':   return '🥈'
      case 'diamond':  return '💎'
      case 'cement':   return '🧱'
      case 'steel':    return '🔩'
      case 'rubber':   return '⚙️'
      case 'oil':      return '🛢️'
      case 'wheat':    return '🌾'
      default:         return '📦'
    }
  }
  // 文字版本（emoji 不显示时的兜底）
  const typeShortName = (t?: string) => {
    switch (t) {
      case 'gold':     return 'AU'
      case 'silver':   return 'AG'
      case 'diamond':  return 'PT'  // PT = precious stone
      case 'cement':   return 'SN'  // 水泥
      case 'steel':    return 'GC'  // 钢材
      case 'rubber':   return 'XJ'  // 橡胶
      case 'oil':      return 'YU'  // 原油
      case 'wheat':    return 'XM'  // 小麦
      default:         return '?'
    }
  }
  const typeColor = selected?.category === 'precious' ? 'from-yellow-500 to-yellow-700'
    : selected?.category === 'material' ? 'from-stone-500 to-stone-700'
    : selected?.category === 'energy' ? 'from-orange-500 to-red-600'
    : selected?.category === 'agriculture' ? 'from-green-500 to-green-700'
    : 'from-gray-400 to-gray-600'
  const categoryName = (c?: string) => c === 'precious' ? '贵金属' : c === 'material' ? '建材'
    : c === 'energy' ? '能源' : c === 'agriculture' ? '农产品' : ''

  // 钻石期货价 × 数量
  const diamondFut = futures.find(f => f.type === 'diamond')
  const diamondUnitPrice = diamondFut ? diamondFut.price : 5000
  const diamondCount = myPlayer?.diamonds || 0
  const diamondValue = diamondCount * diamondUnitPrice

  // 我的建材库存
  const materials = myPlayer?.materials || { cement: 0, steel: 0, rubber: 0, preciousMetals: 0, diamonds: 0 }

  const filteredFutures = filterCategory === 'all'
    ? futures
    : futures.filter(f => f.category === filterCategory)

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
          <div className="mt-1 grid grid-cols-2 gap-x-1 gap-y-0.5 text-[10px]">
            <span className="text-yellow-400">💎 {diamondCount}</span>
            <span className="text-stone-400">🧱水泥{materials.cement}</span>
            <span className="text-gray-400">💰 ${myPlayer?.deposit.toLocaleString()}</span>
            <span className="text-orange-400">🔩钢材{materials.steel}</span>
          </div>
        </div>
      </div>

      {isOpen && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setIsOpen(false)}
        >
<div
          style={{ width: '1100px', height: '720px', maxWidth: '95vw', maxHeight: '92vh' }}
          className="bg-secondary rounded-xl shadow-2xl overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 bg-primary/50 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛢️</span>
              <span className="text-sm font-bold">期货交易所</span>
              <span className="text-xs text-gray-400">(双向交易 · T+0 · 杠杆 · 涨跌停 · 实物交割)</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-lg">×</button>
          </div>

          <div className="flex-1 flex min-h-0">
          {/* 左侧交易区 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-w-0">
            {/* 我的库存 */}
            <div className="bg-primary/60 rounded-lg p-2">
              <div className="text-xs text-gray-400 mb-1">📦 我的库存</div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>💎 <span className="text-yellow-300 font-bold">{diamondCount}</span></div>
                <div>🧱水泥 <span className="text-stone-300 font-bold">{materials.cement}</span></div>
                <div>🔩钢材 <span className="text-gray-300 font-bold">{materials.steel}</span></div>
                <div>⚙️橡胶 <span className="text-yellow-300 font-bold">{materials.rubber}</span></div>
                <div>🥇贵金属 <span className="text-yellow-400 font-bold">{materials.preciousMetals}</span></div>
                <div>💰存款 <span className="text-green-400 font-bold">${myPlayer?.deposit.toLocaleString()}</span></div>
                <div>💵现金 <span className="text-green-300 font-bold">${myPlayer?.cash.toLocaleString()}</span></div>
              </div>
            </div>

            {/* 类别过滤 */}
            <div className="flex gap-1 flex-wrap">
              {(['all', 'precious', 'material', 'energy', 'agriculture'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilterCategory(c)}
                  className={`px-3 py-1 text-xs rounded font-bold ${
                    filterCategory === c ? 'bg-accent text-white' : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {c === 'all' ? '全部' : categoryName(c)}
                </button>
              ))}
            </div>

            {/* 期货品种选择 */}
            <div>
              <div className="text-xs text-gray-400 mb-2">期货品种</div>
              <div className="grid grid-cols-3 gap-2">
                {filteredFutures.map(f => (
                  <div
                    key={f.symbol}
                    onClick={() => { setSelectedFutures(f.symbol); setAction('buy') }}
                    style={{ cursor: 'pointer' }}
                    className={`
                      p-3 rounded-lg border-2 transition-all
                      bg-gradient-to-br ${selected?.symbol === f.symbol ? typeColor : (f.category === 'precious' ? 'from-yellow-500 to-yellow-700' : f.category === 'material' ? 'from-stone-500 to-stone-700' : f.category === 'energy' ? 'from-orange-500 to-red-600' : 'from-green-500 to-green-700')}
                      ${selectedFutures === f.symbol ? 'ring-2 ring-white shadow-2xl scale-105' : 'border-gray-700'}
                    `}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <span className="text-2xl leading-none">{typeIcon(f.type)}</span>
                        <span className="text-[10px] font-bold text-white bg-black/40 px-1 rounded">{typeShortName(f.type)}</span>
                      </div>
                      <span className="text-[10px] text-white/70">{f.symbol}</span>
                    </div>
                    <div className="text-white font-bold text-sm">{f.name}</div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-white font-bold">${f.price}</span>
                      <span className={`text-xs ${f.change >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                        {f.change >= 0 ? '+' : ''}{f.change.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between mt-0.5 text-[9px] text-white/80">
                      <span>{f.limitUp ? '🔴 涨停' : f.limitDown ? '🔵 跌停' : '正常'}</span>
                      <span>📅 {f.expiresInDays}天到期</span>
                    </div>
                    {f.isMaterial && <div className="text-[10px] text-yellow-200 mt-0.5">📦 可实物交割</div>}
                  </div>
                ))}
              </div>
            </div>

              {selected && (
                <div className="bg-primary rounded-lg p-4 border border-yellow-700/50 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl leading-none">{typeIcon(selected.type)}</span>
                      <div>
                        <div className="font-bold">{selected.name} <span className="text-[10px] text-gray-400">({typeShortName(selected.type)})</span></div>
                        <div className="text-xs text-gray-400">基础价 ${selected.base} · {categoryName(selected.category)} · 波动率 {(selected.volatility * 100).toFixed(1)}%</div>
                        <div className="text-[10px] text-cyan-300">📅 合约到期 {selected.expiresInDays} 天后（可提前申请实物交割）</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">${selected.price}</div>
                      <div className={`text-sm ${selected.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {selected.change >= 0 ? '+' : ''}{selected.change.toFixed(2)}%
                      </div>
                      {selected.limitUp && <div className="text-[10px] text-orange-400 font-bold">🔴 涨停</div>}
                      {selected.limitDown && <div className="text-[10px] text-blue-400 font-bold">🔵 跌停</div>}
                    </div>
                  </div>

                  {/* 事件消息 - 根据权限显示 */}
                  {selected.eventDesc !== '无重大事件' && (
                    myPlayer?.hasTonghuashun || myPlayer?.atFuturesExchange ? (
                      <div className="text-xs bg-orange-900/30 text-orange-400 rounded p-2">
                        📢 {selected.eventDesc}（剩余 {selected.eventDays} 天）
                      </div>
                    ) : (
                      <div className="text-xs bg-gray-700/50 text-gray-400 rounded p-2">
                        🔒 有突发事件（前往期货交易所或购买同花顺软件查看详情）
                      </div>
                    )
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
                            {myHolding.longLeverage > 1 && <span className="ml-1 text-cyan-300">{myHolding.longLeverage}x杠杆</span>}
                          </div>
                        )}
                        {myHolding.shortQuantity > 0 && (
                          <div>
                            <span className="text-orange-400">空 {myHolding.shortQuantity}</span> @ ${myHolding.shortAvgCost.toFixed(2)}
                            {myHolding.shortLeverage > 1 && <span className="ml-1 text-cyan-300">{myHolding.shortLeverage}x杠杆</span>}
                          </div>
                        )}
                      </div>
                      <div className="text-xs mt-1">
                        浮动盈亏: <span className={floatingPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {floatingPnl >= 0 ? '+' : ''}${Math.round(floatingPnl).toLocaleString()}
                        </span>
                      </div>
                      {(myHolding.longQuantity > 0 || myHolding.shortQuantity > 0) && (
                        <div className="mt-2 pt-2 border-t border-gray-700 text-[11px] space-y-0.5">
                          {myHolding.longQuantity > 0 && (
                            <div className="flex justify-between"><span className="text-gray-400">多头冻结资金</span><span className="text-cyan-300">${Math.round(myHolding.longFrozenCost || 0).toLocaleString()}</span></div>
                          )}
                          {myHolding.shortQuantity > 0 && (
                            <>
                              <div className="flex justify-between"><span className="text-gray-400">空头初始保证金</span><span className="text-orange-300">${Math.round(myHolding.shortInitialMargin || 0).toLocaleString()}</span></div>
                              <div className="flex justify-between"><span className="text-gray-400">维持保证金</span><span className={floatingPnl + (myHolding.shortInitialMargin || 0) < maintenanceMargin ? 'text-red-400 font-bold' : 'text-yellow-300'}>${maintenanceMargin.toLocaleString()}</span></div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-5 gap-2">
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
                    <button
                      type="button"
                      onClick={() => setAction('delivery')}
                      disabled={!myHolding || (myHolding.longQuantity === 0 && myHolding.shortQuantity === 0) || (!selected.isMaterial && selected.category !== 'precious')}
                      className={`py-2 rounded-lg font-bold text-sm ${
                        action === 'delivery' ? 'bg-amber-600 text-white' : 'bg-gray-700'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                      title="实物交割：多→获得实物；空→交付实物获货款"
                    >
                      实物交割
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction('exchange')}
                      disabled={!myHolding || (myHolding.longQuantity || 0) < 1 || !selected.isMaterial}
                      className={`py-2 rounded-lg font-bold text-sm ${
                        action === 'exchange' ? 'bg-yellow-600 text-white' : 'bg-gray-700'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      兑换建材
                    </button>
                  </div>

                  {/* 杠杆选择 (做多/做空时) */}
                  {(action === 'buy' || action === 'sell') && (
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>⚡ 杠杆倍数（1~10x，10倍 = 1%波动→10%盈亏）</span>
                        <span className="font-bold text-cyan-300">{leverage}x</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[1, 2, 5, 7, 10].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setLeverage(n)}
                            className={`py-1 text-xs rounded ${leverage === n ? 'bg-cyan-600 text-white' : 'bg-gray-700'}`}
                          >
                            {n}x
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {action !== 'close' && action !== 'exchange' && action !== 'delivery' && (
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
                        <div className="flex justify-between"><span>名义价值</span><span className="text-white font-bold">${cost.toLocaleString()}</span></div>
                        {action === 'buy' && <div className="flex justify-between"><span>{leverage > 1 ? `${leverage}x杠杆后冻结` : '占用资金'}</span><span className="text-cyan-300 font-bold">${Math.ceil(cost / leverage).toLocaleString()}</span></div>}
                        {action === 'sell' && <div className="flex justify-between"><span>🔒 初始保证金(20%/{leverage}x)</span><span className="text-orange-300 font-bold">${Math.ceil(cost * 0.20 / leverage).toLocaleString()}</span></div>}
                        {action === 'sell' && <div className="flex justify-between"><span>⚠️ 维持保证金(15%)</span><span className="text-yellow-300 font-bold">${Math.ceil(cost * 0.15).toLocaleString()}</span></div>}
                        <div className="flex justify-between text-gray-500"><span>手续费(2%)</span><span>${fee.toLocaleString()}</span></div>
                        <div className="flex justify-between text-red-400 font-bold"><span>实际冻结(从存款)</span><span>${(action === 'sell' ? Math.ceil(cost * 0.20 / leverage) + fee : Math.ceil(cost / leverage) + fee).toLocaleString()}</span></div>
                        <div className="text-[10px] text-gray-400">💡 现金留给地皮交易；期货保证金只从存款扣</div>
                        {leverage > 1 && <div className="text-[10px] text-cyan-300">💡 价格变动1%，账户变动{leverage}%（高风险高回报）</div>}
                      </div>
                    </>
                  )}

                  {action === 'exchange' && (
                    <div className="bg-yellow-900/20 rounded p-2 text-xs space-y-1">
                      <div className="text-yellow-300 font-bold">📦 兑换建材说明：</div>
                      <div>卖出 <span className="text-yellow-300 font-bold">{quantity}</span> 手 {selected.name} → 获得 <span className="text-yellow-300 font-bold">{selected.type === 'cement' ? '水泥' : selected.type === 'steel' ? '钢材' : '橡胶'} ×{quantity}</span></div>
                      <div className="text-gray-400">卖出资金 ${(selected.price * quantity).toLocaleString()} 返还到现金账户</div>
                      <div className="text-gray-500">当前持有: {myHolding?.longQuantity || 0} 手</div>
                    </div>
                  )}

                  {action === 'delivery' && (
                    <div className="bg-amber-900/20 rounded p-2 text-xs space-y-1">
                      <div className="text-amber-300 font-bold">📅 实物交割说明：</div>
                      <div>• <span className="text-green-400">多头交割</span>：按当前价付款 → 获得实物（{selected.isMaterial ? '水泥/钢材/橡胶' : '贵金属'}）</div>
                      <div>• <span className="text-orange-400">空头交割</span>：交付实物 → 收到货款</div>
                      <div>• ⚠️ 空头库存不足将触发违约处罚 + 强制平仓</div>
                      <div>• 不主动交割则到期自动按当前价平仓</div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleTrade}
                    disabled={!isMyTurn || (action === 'close' && (!myHolding || (myHolding.longQuantity === 0 && myHolding.shortQuantity === 0))) || (action === 'exchange' && (!myHolding || (myHolding.longQuantity || 0) < quantity)) || (action === 'delivery' && (!myHolding || (myHolding.longQuantity === 0 && myHolding.shortQuantity === 0))) || (action !== 'close' && action !== 'exchange' && action !== 'delivery' && (!myPlayer || myPlayer.cash + myPlayer.deposit < (action === 'sell' ? Math.ceil(cost * 0.20 / leverage) + fee : Math.ceil(cost / leverage) + fee)))}
                    className={`w-full py-3 rounded-lg font-bold transition-all ${
                      isMyTurn && ((action === 'close') || action === 'exchange' || action === 'delivery' || (myPlayer && myPlayer.cash + myPlayer.deposit >= (action === 'sell' ? Math.ceil(cost * 0.20 / leverage) + fee : Math.ceil(cost / leverage) + fee)))
                        ? action === 'buy' ? 'bg-gradient-to-r from-green-600 to-green-800 text-white cursor-pointer hover:shadow-lg' :
                          action === 'sell' ? 'bg-gradient-to-r from-orange-600 to-orange-800 text-white cursor-pointer hover:shadow-lg' :
                          action === 'exchange' ? 'bg-gradient-to-r from-yellow-600 to-yellow-800 text-white cursor-pointer hover:shadow-lg' :
                          action === 'delivery' ? 'bg-gradient-to-r from-amber-600 to-amber-800 text-white cursor-pointer hover:shadow-lg' :
                          'bg-gradient-to-r from-purple-600 to-purple-800 text-white cursor-pointer hover:shadow-lg'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isMyTurn
                      ? (action === 'buy' ? `✅ 做多 ${quantity} 手（${leverage}x杠杆）` :
                         action === 'sell' ? `📉 做空 ${quantity} 手（${leverage}x杠杆）` :
                         action === 'exchange' ? `📦 兑换 ${quantity} 手 → 建材` :
                         action === 'delivery' ? `📅 申请实物交割` :
                         `🔄 平仓 ${quantity} 手`)
                      : '等待回合'}
                  </button>
                </div>
              )}

              <div className="text-xs text-gray-500 bg-black/20 rounded p-3">
                <div className="font-bold text-gray-400 mb-1">💡 玩法说明</div>
                <div>• <span className="text-yellow-300">双向交易</span>：做多看涨、做空看跌，涨跌都能赚钱</div>
                <div>• <span className="text-green-400">T+0</span>：当日开仓可当日平仓，无次数限制</div>
                <div>• <span className="text-cyan-300">杠杆机制</span>：1~10x杠杆，小资金撬动大合约，1%价格波动 = {leverage}%账户波动</div>
                <div>• <span className="text-orange-400">涨跌停</span>：每个品种单日涨跌幅有上限，涨停不可买多/平多，跌停不可做空/平空</div>
                <div>• <span className="text-amber-400">实物交割</span>：合约到期前可申请，多→拿实物；空→交实物获货款</div>
                <div>• <span className="text-purple-400">平仓</span>：部分或全部平仓，盈亏在平仓时锁定</div>
                <div>• <span className="text-cyan-300">事件</span>: 需站在交易所或购买同花顺软件才能查看详情</div>
              </div>
          </div>

          {/* 右侧持仓列表 */}
          <div className="w-72 border-l border-gray-700 bg-primary/40 flex flex-col">
            <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-400 font-bold">📋 玩家持仓</div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {players.map(p => {
                const pH = (p.futuresHoldings || []).filter((h: any) => h.longQuantity > 0 || h.shortQuantity > 0)
                if (pH.length === 0) return (
                  <div key={p.id} className="bg-black/20 rounded p-2">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                      <span className="text-xs font-bold" style={{ color: p.color }}>{p.name}</span>
                      <span className="text-[10px] text-gray-500">无持仓</span>
                    </div>
                  </div>
                )
                return (
                  <div key={p.id} className="bg-black/30 rounded p-2 border-l-2" style={{ borderColor: p.color }}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                      <span className="text-xs font-bold" style={{ color: p.color }}>{p.name}</span>
                      {p.id === myPlayerId && <span className="text-[9px] bg-yellow-600 text-white px-1 rounded">我</span>}
                    </div>
                    <div className="space-y-1">
                      {pH.map((h: any) => {
                        const f = futures.find(x => x.symbol === h.symbol)
                        if (!f) return null
                        const pnl = (h.longQuantity > 0 ? (f.price - h.longAvgCost) * f.unit * h.longQuantity : 0)
                          + (h.shortQuantity > 0 ? (h.shortAvgCost - f.price) * f.unit * h.shortQuantity : 0)
                        const isSelected = selectedFutures === h.symbol
                        return (
                          <div
                            key={h.symbol}
                            className={`text-[10px] p-1 rounded ${isSelected ? 'bg-accent/40 ring-1 ring-accent' : 'bg-black/30 hover:bg-black/50'} cursor-pointer`}
                            onClick={() => { setSelectedFutures(h.symbol); setAction('close') }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <span>{typeIcon(f.type)}</span>
                                <span className="font-bold truncate">{f.name}</span>
                              </span>
                              <span className={pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                {pnl >= 0 ? '+' : ''}${Math.round(pnl).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between mt-0.5">
                              <div>
                                {h.longQuantity > 0 && <span className="text-green-400 mr-1">多{h.longQuantity}{h.longLeverage > 1 ? `(${h.longLeverage}x)` : ''}</span>}
                                {h.shortQuantity > 0 && <span className="text-orange-400">空{h.shortQuantity}{h.shortLeverage > 1 ? `(${h.shortLeverage}x)` : ''}</span>}
                              </div>
                              <span className="text-gray-500">@${f.price.toFixed(2)}</span>
                            </div>
                          </div>
                        )
                      })}
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