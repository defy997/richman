import { useState, useMemo, useEffect, memo } from 'react'
import { useGameStore, Stock, KLine } from '../store/gameStore'
import { createPortal } from 'react-dom'
import ReactECharts from 'echarts-for-react'

// ECharts K线 + MA + MACD + 成交量
const StockChart = memo(function StockChart({ stock }: { stock: Stock }) {
  const closes = stock.history.map(h => h.close)
  const volumes = stock.history.map(h => h.volume)
  const category = stock.history.map((_, i) => `D${i + 1}`)

  // 计算 MA5/10/20
  const calcMA = (data: number[], period: number): (number | null)[] => {
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
  const ma20 = calcMA(closes, 20)

  // MACD
  const calcMACD = (prices: number[]) => {
    const emaFast: number[] = []
    const emaSlow: number[] = []
    const dif: number[] = []
    const dea: number[] = []
    const macd: number[] = []
    let prevEmaFast = prices[0]
    let prevEmaSlow = prices[0]
    let prevDea = 0
    const kFast = 2 / 13, kSlow = 2 / 27, kSignal = 2 / 10
    for (let i = 0; i < prices.length; i++) {
      const p = prices[i]
      if (i === 0) { emaFast.push(p); emaSlow.push(p) }
      else {
        const ef = p * kFast + prevEmaFast * (1 - kFast)
        const es = p * kSlow + prevEmaSlow * (1 - kSlow)
        emaFast.push(ef); emaSlow.push(es)
        prevEmaFast = ef; prevEmaSlow = es
      }
      const d = emaFast[i] - emaSlow[i]
      dif.push(d)
      if (i === 0) { dea.push(d); prevDea = d }
      else { const de = d * kSignal + prevDea * (1 - kSignal); dea.push(de); prevDea = de }
      macd.push(2 * (dif[i] - dea[i]))
    }
    return { dif, dea, macd }
  }

  const macdData = calcMACD(closes)

  // K线
  const candleData = stock.history.map(h => [h.open, h.close, h.low, h.high])
  const volumeColors = stock.history.map(h => h.close >= h.open ? '#ef4444' : '#22c55e')

  const option = useMemo(() => ({
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(0,0,0,0.85)',
      borderColor: '#374151',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any[]) => {
        const c = params.find(p => p.seriesName === 'K线')
        if (!c) return ''
        const i = c.dataIndex
        const item = stock.history[i]
        if (!item) return ''
        return `<div style="font-size:11px">
          <div style="color:#fbbf24;font-weight:bold;margin-bottom:4px">D${i + 1}</div>
          <div>开: ${item.open.toFixed(2)}</div>
          <div>收: ${item.close.toFixed(2)}</div>
          <div>高: ${item.high.toFixed(2)}</div>
          <div>低: ${item.low.toFixed(2)}</div>
          <div>量: ${(item.volume / 1000).toFixed(1)}K</div>
          <div style="color:#60a5fa">MA5: ${ma5[i] ?? '-'}</div>
          <div style="color:#fbbf24">MA10: ${ma10[i] ?? '-'}</div>
          <div style="color:#a78bfa">MA20: ${ma20[i] ?? '-'}</div>
        </div>`
      }
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    legend: {
      data: ['K线', 'MA5', 'MA10', 'MA20', 'MACD'],
      textStyle: { color: '#9ca3af', fontSize: 10 },
      top: 0,
      itemWidth: 12,
      itemHeight: 8,
    },
    grid: [
      { left: '8%', right: '4%', top: '10%', height: '50%' },
      { left: '8%', right: '4%', top: '65%', height: '12%' },
      { left: '8%', right: '4%', top: '80%', height: '14%' }
    ],
    xAxis: [
      { type: 'category', data: category, gridIndex: 0, axisLine: { lineStyle: { color: '#374151' } }, axisLabel: { show: false } },
      { type: 'category', data: category, gridIndex: 1, axisLine: { lineStyle: { color: '#374151' } }, axisLabel: { show: false } },
      { type: 'category', data: category, gridIndex: 2, axisLine: { lineStyle: { color: '#374151' } }, axisLabel: { color: '#6b7280', fontSize: 9 } }
    ],
    yAxis: [
      { scale: true, gridIndex: 0, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { lineStyle: { color: '#1f2937' } }, axisLabel: { color: '#6b7280', fontSize: 9 } },
      { scale: true, gridIndex: 1, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { show: false }, axisLabel: { color: '#6b7280', fontSize: 9 } },
      { scale: true, gridIndex: 2, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { lineStyle: { color: '#1f2937' } }, axisLabel: { color: '#6b7280', fontSize: 9 } }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, 2], start: 50, end: 100 },
      { show: true, type: 'slider', xAxisIndex: [0, 1, 2], bottom: 2, height: 18, start: 50, end: 100, backgroundColor: 'rgba(55,65,81,0.3)', fillerColor: 'rgba(239,68,68,0.2)', textStyle: { fontSize: 9 } }
    ],
    series: [
      {
        name: 'K线', type: 'candlestick', data: candleData,
        xAxisIndex: 0, yAxisIndex: 0,
        itemStyle: {
          color: '#ef4444', color0: '#22c55e',
          borderColor: '#dc2626', borderColor0: '#16a34a'
        }
      },
      { name: 'MA5', type: 'line', data: ma5, xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { width: 1, color: '#60a5fa' }, showSymbol: false },
      { name: 'MA10', type: 'line', data: ma10, xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { width: 1, color: '#fbbf24' }, showSymbol: false },
      { name: 'MA20', type: 'line', data: ma20, xAxisIndex: 0, yAxisIndex: 0, smooth: true, lineStyle: { width: 1, color: '#a78bfa' }, showSymbol: false },
      {
        name: 'Volume', type: 'bar', data: volumes.map((v, i) => ({ value: v, itemStyle: { color: volumeColors[i] } })),
        xAxisIndex: 1, yAxisIndex: 1
      },
      {
        name: 'MACD', type: 'bar', data: macdData.macd.map((v, i) => ({ value: v, itemStyle: { color: v >= 0 ? '#ef4444' : '#22c55e' } })),
        xAxisIndex: 2, yAxisIndex: 2
      },
      { name: 'DIF', type: 'line', data: macdData.dif, xAxisIndex: 2, yAxisIndex: 2, smooth: true, lineStyle: { width: 1, color: '#fbbf24' }, showSymbol: false },
      { name: 'DEA', type: 'line', data: macdData.dea, xAxisIndex: 2, yAxisIndex: 2, smooth: true, lineStyle: { width: 1, color: '#60a5fa' }, showSymbol: false }
    ]
  }), [closes.length, stock.symbol, stock.eventDesc])

  return (
    <ReactECharts
      option={option}
      style={{ height: '320px', width: '100%' }}
      notMerge
      lazyUpdate={false}
    />
  )
})

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
    socket?.emit('tradeStock', { symbol: selectedStock.symbol, action, quantity, leverage })
    setQuantity(1)
  }

  const handleBuyTonghuashun = () => {
    socket?.emit('buyTonghuashun')
  }

  const canViewNews = myPlayer?.hasTonghuashun || myPlayer?.atStockExchange
  const showTonghuashunButton = myPlayer && !myPlayer.hasTonghuashun && myPlayer.atStockExchange && isMyTurn
  const tonghuashunPrice = 20_000_000

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
      <div className="p-3">
        <div
          className="bg-primary rounded-lg p-2 cursor-pointer hover:bg-primary/80 transition-colors"
          onClick={(e) => { e.stopPropagation(); setIsOpen(true) }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📈</span>
              <span className="text-sm font-bold">股票市场</span>
              {myPlayer?.hasTonghuashun && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">📱同花顺</span>}
            </div>
            <span className="text-gray-400 text-xs">{myPlayer?.atStockExchange ? '🏛️在交易所' : '点击展开 →'}</span>
          </div>
          <div className="flex gap-2 mt-1 overflow-x-auto">
            {stocks.slice(0, 6).map(s => (
              <div key={s.symbol} className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${s.change >= 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                {s.name} {s.change >= 0 ? '+' : ''}{s.change.toFixed(1)}%
              </div>
            ))}
          </div>
        </div>
      </div>

      {isOpen && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{ width: '1100px', height: '700px', maxWidth: '95vw', maxHeight: '92vh' }}
            className="bg-secondary rounded-xl shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* 顶部 Tonghuashun 横幅（醒目位置） */}
            {showTonghuashunButton && (
              <div className="bg-gradient-to-r from-blue-700 to-blue-900 px-4 py-2 flex items-center justify-between border-b-2 border-yellow-400">
                <div className="flex items-center gap-2 text-white">
                  <span className="text-xl">📱</span>
                  <div>
                    <div className="text-sm font-bold">🏛️ 股票交易所特供：同花顺软件</div>
                    <div className="text-[10px] text-blue-200">购买后可永久查看所有股票/期货利好利空消息（无需每次到交易所）</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBuyTonghuashun}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-blue-900 text-sm font-bold rounded shadow-lg"
                >
                  购买 (${tonghuashunPrice.toLocaleString()})
                </button>
              </div>
            )}
            {myPlayer?.hasTonghuashun && (
              <div className="bg-blue-900/50 px-4 py-1 text-xs text-blue-200 border-b border-blue-700">
                ✅ 已装备 [同花顺软件]，所有股票/期货利好利空消息自动可见
              </div>
            )}
            <div className="flex-1 flex overflow-hidden">
            {/* 左侧：板块 */}
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
                <div className="text-right">状态</div>
                <div className="text-right">持仓</div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredStocks.map(stock => {
                  const h = myPlayer?.stocks.find(s => s.symbol === stock.symbol)
                  // 统计每个玩家持仓（多 + 空）
                  const playerHoldings = players
                    .map(p => {
                      const ph = p.stocks.find(s => s.symbol === stock.symbol)
                      return ph && (ph.quantity > 0 || (ph.shortQuantity || 0) > 0)
                        ? { player: p, holding: ph }
                        : null
                    })
                    .filter(Boolean) as { player: typeof players[0]; holding: NonNullable<ReturnType<typeof players[0]['stocks']['find']>> }[]
                  const allH = playerHoldings.reduce((sum, x) => sum + (x.holding.quantity || 0) + (x.holding.shortQuantity || 0), 0)
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
                      </div>
                      <div className="text-right">
                        {stock.isNoManipulator && <span className="text-purple-400">🚫</span>}
                        {stock.isConsolidating && <span className="text-yellow-400 ml-0.5">⏸️</span>}
                        {stock.eventDesc !== '无重大事件' && (
                          canViewNews
                            ? <span className="text-orange-400 ml-0.5">📢</span>
                            : <span className="text-gray-500 ml-0.5">🔒</span>
                        )}
                        {stock.limitUp && <span className="text-orange-400 ml-0.5">涨停</span>}
                        {stock.limitDown && <span className="text-blue-400 ml-0.5">跌停</span>}
                        <span className="text-gray-500 text-[10px] ml-1">×{allH}</span>
                      </div>
                      <div className="text-right">
                        {playerHoldings.length === 0 ? (
                          <span className="text-gray-600 text-[10px]">无人持仓</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 justify-end">
                            {playerHoldings.map(({ player, holding }) => (
                              <span
                                key={player.id}
                                className="text-[9px] px-1 py-0.5 rounded whitespace-nowrap"
                                style={{
                                  backgroundColor: `${player.color}33`,
                                  borderLeft: `2px solid ${player.color}`
                                }}
                              >
                                <span className="font-bold" style={{ color: player.color }}>{player.name}</span>
                                {holding.quantity > 0 && <span className="text-green-400 ml-1">多{holding.quantity}</span>}
                                {(holding.shortQuantity || 0) > 0 && <span className="text-orange-400 ml-1">空{holding.shortQuantity}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {selectedStock?.news && (
                <div className="p-2 bg-primary/30 border-t border-gray-700 text-xs text-yellow-400">
                  {canViewNews ? (
                    <>📰 {selectedStock.news}</>
                  ) : (
                    <>🔒 有利好/利空消息（前往股票交易所或购买同花顺软件查看）</>
                  )}
                </div>
              )}
              {showTonghuashunButton && (
                <div className="p-2 bg-primary/30 border-t border-gray-700">
                  <button
                    type="button"
                    onClick={handleBuyTonghuashun}
                    className="w-full py-2 bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white text-xs font-bold rounded"
                  >
                    📱 购买同花顺软件 ($${tonghuashunPrice.toLocaleString()}) — 永久查看所有股票/期货消息
                  </button>
                </div>
              )}
              {myPlayer?.hasTonghuashun && (
                <div className="p-2 bg-blue-900/30 border-t border-gray-700 text-xs text-blue-300">
                  ✅ 已装备 [同花顺软件]，可在任意位置查看消息
                </div>
              )}
            </div>

            {/* 右侧：详情/交易 */}
            <div className="w-80 bg-primary/30 border-l border-gray-700 flex flex-col flex-shrink-0">
              <div className="p-2 border-b border-gray-700 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300">股票详情</span>
                <button onClick={() => setIsOpen(false)} className="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center">×</button>
              </div>

              {selectedStock ? (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  <div>
                    <div className="text-sm font-bold">{selectedStock.name}</div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-2xl font-bold">${selectedStock.price}</span>
                      <span className={`text-sm ${selectedStock.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatChange(selectedStock.change)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {selectedStock.sector} · {selectedStock.symbol} · 基础价 ${selectedStock.base}
                    </div>
                    {selectedStock.eventDesc !== '无重大事件' && (
                      canViewNews ? (
                        <div className="text-xs text-orange-400 mt-1">📢 {selectedStock.eventDesc} ({selectedStock.eventDays}天)</div>
                      ) : (
                        <div className="text-xs text-gray-500 mt-1">🔒 有事件（前往股票交易所或购买同花顺软件查看）</div>
                      )
                    )}
                    {selectedStock.isConsolidating && (
                      <div className="text-xs text-yellow-400 mt-1">⏸️ 横盘期 {selectedStock.consolidateDays}天</div>
                    )}
                    {selectedStock.isNoManipulator && (
                      <div className="text-xs text-purple-400 mt-1">🚫 反操盘期 {selectedStock.noManipulatorDays}天</div>
                    )}
                  </div>

                  <div className="bg-black/30 rounded-lg overflow-hidden">
                    <StockChart stock={selectedStock} />
                  </div>

                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">玩家持仓 ({allHoldings.length})</div>
                    {allHoldings.length > 0 ? (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {allHoldings.map(({ player, holding }) => {
                          const longPnl = holding.quantity > 0
                            ? (selectedStock.price - holding.avgCost) * holding.quantity
                            : 0
                          const shortPnl = (holding.shortQuantity || 0) > 0
                            ? ((holding.shortAvgCost || 0) - selectedStock.price) * (holding.shortQuantity || 0)
                            : 0
                          const isMe = player.id === myPlayerId
                          const shrQty = holding.shortQuantity || 0
                          const shortNotional = selectedStock.price * shrQty
                          const shortInitialMargin = holding.shortMarginFrozen || shortNotional * 0.5
                          const shortUnrealizedLoss = ((holding.shortAvgCost || 0) - selectedStock.price) * shrQty
                          const shortAvailable = shortInitialMargin + shortUnrealizedLoss
                          const shortMaintenance = shortNotional * 0.3
                          const shortHealth = shortMaintenance > 0 ? shortAvailable / shortMaintenance : 1
                          const shortIsDanger = shortHealth < 1.5
                          const shortIsCritical = shortHealth < 1.0
                          return (
                            <div
                              key={player.id}
                              className={`bg-black/30 rounded px-1.5 py-1 text-[10px] border ${
                                isMe ? 'border-accent/50' : 'border-gray-700'
                              } ${shrQty > 0 ? 'border-l-2 border-l-orange-400' : ''}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.color }} />
                                  <span className={isMe ? 'text-accent font-bold' : 'text-gray-300'}>{player.name}</span>
                                  {isMe && <span className="text-[9px] text-gray-500">(我)</span>}
                                </div>
                                <div className="flex gap-2">
                                  {holding.quantity > 0 && <span className="text-green-400">多{holding.quantity}</span>}
                                  {shrQty > 0 && <span className="text-orange-400">空{shrQty}</span>}
                                </div>
                              </div>
                              {holding.quantity > 0 && (
                                <div className="flex justify-between text-[9px] mt-0.5">
                                  <span className="text-gray-500">多成本 ${holding.avgCost.toFixed(2)}</span>
                                  <span className={longPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                    盈亏 {longPnl >= 0 ? '+' : ''}${longPnl.toFixed(0)}
                                  </span>
                                </div>
                              )}
                              {shrQty > 0 && (
                                <div className="text-[9px] mt-0.5">
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">空成本 ${(holding.shortAvgCost || 0).toFixed(2)}</span>
                                    <span className={shortPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                      盈亏 {shortPnl >= 0 ? '+' : ''}${shortPnl.toFixed(0)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">健康度</span>
                                    <span className={shortIsCritical ? 'text-red-400 font-bold' : shortIsDanger ? 'text-orange-400' : 'text-green-400'}>
                                      {(shortHealth * 100).toFixed(0)}%
                                      {shortIsCritical && ' 🚨'}
                                      {shortIsDanger && !shortIsCritical && ' ⚠️'}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
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
                        <div>多成本: <span className="text-gray-300">${myStock.avgCost.toFixed(2)}</span></div>
                        <div>空成本: <span className="text-gray-300">${myStock.shortAvgCost?.toFixed(2) || '0'}</span></div>
                      </div>
                      {myStock.quantity > 0 && (
                        <div className="text-[10px] mt-1">
                          多盈亏: <span className={((selectedStock.price - myStock.avgCost) * myStock.quantity) >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {((selectedStock.price - myStock.avgCost) * myStock.quantity) >= 0 ? '+' : ''}
                            ${((selectedStock.price - myStock.avgCost) * myStock.quantity).toFixed(0)}
                          </span>
                        </div>
                      )}
                      {/* 做空三道防线 */}
                      {(myStock.shortQuantity || 0) > 0 && (
                        <div className="mt-1 pt-1 border-t border-gray-700">
                          <div className="text-[10px] text-orange-400 mb-1">📌 做空保证金</div>
                          {(() => {
                            const notional = selectedStock.price * (myStock.shortQuantity || 0)
                            const initialMargin = myStock.shortMarginFrozen || (notional * 0.5)
                            const maintenanceMargin = notional * 0.3
                            const unrealizedLoss = ((myStock.shortAvgCost || 0) - selectedStock.price) * (myStock.shortQuantity || 0)
                            const availableMargin = initialMargin + unrealizedLoss
                            const healthRatio = maintenanceMargin > 0 ? availableMargin / maintenanceMargin : 1
                            const shortPnl = ((myStock.shortAvgCost || 0) - selectedStock.price) * (myStock.shortQuantity || 0)
                            const isDanger = healthRatio < 1.5
                            const isCritical = healthRatio < 1.0
                            return (
                              <div className="space-y-0.5 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-gray-400">初始保证金</span>
                                  <span className="text-blue-400">${Math.round(initialMargin).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">维持保证金</span>
                                  <span className="text-yellow-400">${Math.round(maintenanceMargin).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">当前可用</span>
                                  <span className={isCritical ? 'text-red-400 font-bold' : isDanger ? 'text-orange-400' : 'text-green-400'}>
                                    ${Math.round(availableMargin).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">健康度</span>
                                  <span className={isCritical ? 'text-red-400 font-bold' : isDanger ? 'text-orange-400' : 'text-green-400'}>
                                    {(healthRatio * 100).toFixed(0)}%
                                    {isCritical && ' 🚨 强制平仓'}
                                    {isDanger && !isCritical && ' ⚠️ 危险'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">浮动盈亏</span>
                                  <span className={shortPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                    {shortPnl >= 0 ? '+' : ''}${Math.round(shortPnl).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}
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
                      {action === 'buy' && <>
                        <div>💰 需支付(从存款): <span className="text-red-400">${(selectedStock.price * quantity * leverage).toLocaleString()}</span></div>
                        <div className="text-gray-500">现金留给地皮交易</div>
                      </>}
                      {action === 'sell' && <div>💵 获得: <span className="text-green-400">${(selectedStock.price * quantity).toLocaleString()}</span> → 存款</div>}
                      {action === 'short' && <>
                        <div>💵 获得现金: <span className="text-green-400">${(selectedStock.price * quantity).toLocaleString()}</span></div>
                        <div>🔒 保证金(从存款): <span className="text-yellow-400">${(selectedStock.price * quantity / leverage).toLocaleString()}</span></div>
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
          </div>
        </div>,
        document.body
      )}
    </>
  )
}