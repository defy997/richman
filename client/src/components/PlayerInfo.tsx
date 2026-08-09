import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'

export default function PlayerInfo() {
  const { players, myPlayerId, mode, targetAssets, cells, stocks, futures } = useGameStore()

  const myPlayer = players.find(p => p.id === myPlayerId)

  const formatMoney = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`
    return amount.toString()
  }

  // 钻石期货价格
  const diamondPrice = useMemo(() => {
    const f = futures.find(x => x.type === 'diamond')
    return f ? f.price : 5000
  }, [futures])

  // 计算我的资产明细
  const assetDetails = useMemo(() => {
    if (!myPlayer) return null

    const cash = myPlayer.cash
    const deposit = myPlayer.deposit

    // 钻石价值 = 当前钻石期货价格 × 数量
    const diamondsValue = myPlayer.diamonds * diamondPrice

    // 股票市值（做空不计为资产）
    let stockValue = 0
    let longValue = 0
    let shortValue = 0
    const myStocks = myPlayer.stocks.filter(s => s.quantity > 0 || (s.shortQuantity || 0) > 0)
    myStocks.forEach(h => {
      const stock = stocks.find(s => s.symbol === h.symbol)
      if (!stock) return
      if (h.quantity > 0) {
        longValue += stock.price * h.quantity
      }
      if ((h.shortQuantity || 0) > 0) {
        shortValue += stock.price * (h.shortQuantity || 0)
      }
    })
    stockValue = longValue

    // 期货持仓价值（按合约 unit × 价格 × 手数）
    let futuresValue = 0
    const myFutures = myPlayer.futuresHoldings || []
    myFutures.forEach(h => {
      const f = futures.find(x => x.symbol === h.symbol)
      if (!f) return
      if (h.longQuantity > 0) futuresValue += f.price * (f.unit || 1) * h.longQuantity
      // 做空为负债,不计入资产
    })

    // 建材库存价值（按当前建材期货市场价折算 - 实时浮动盈亏）
    const materials = myPlayer.materials || { cement: 0, steel: 0, rubber: 0, preciousMetals: 0 }
    const cementF = futures.find(x => x.type === 'cement')
    const steelF = futures.find(x => x.type === 'steel')
    const rubberF = futures.find(x => x.type === 'rubber')
    const goldF = futures.find(x => x.type === 'gold')
    const cementPrice = cementF?.price || 100
    const steelPrice = steelF?.price || 200
    const rubberPrice = rubberF?.price || 300
    const goldPrice = goldF?.price || 1500
    const materialsValue = cementPrice * materials.cement + steelPrice * materials.steel + rubberPrice * materials.rubber + goldPrice * materials.preciousMetals

    // 地产价值（含酒店 buff 与拍卖地皮加成）
    let propertyValue = 0
    let auctionCount = 0
    myPlayer.properties.forEach(cellId => {
      const cell = cells[cellId]
      if (cell) {
        let val = cell.basePrice * (1 + (cell.level || 0) * 0.5)
        if (cell.upgrade === 'hotel') val *= 1.1
        if ((cell as any).fromAuction) { val *= 1.5; auctionCount++ }
        propertyValue += val
      }
    })

    // 贷款扣除（按已用天数计算利息）
    const loanDebt = myPlayer.loans.reduce((sum, l) => {
      const daysElapsed = 30 - l.turnsRemaining
      const interest = Math.floor(l.amount * l.interestRate * Math.min(daysElapsed, 30) / 30)
      return sum + l.amount + interest
    }, 0)

    const total = cash + deposit + diamondsValue + stockValue + futuresValue + materialsValue + propertyValue - loanDebt

    return {
      cash, deposit, diamondsValue, diamonds: myPlayer.diamonds, diamondPrice,
      stockValue, longValue, shortValue, futuresValue, materialsValue,
      auctionCount, propertyValue,
      cementPrice, steelPrice, rubberPrice, goldPrice,
      loanDebt, myStocks, myFutures, total,
      materials: myPlayer.materials || { cement: 0, steel: 0, rubber: 0, preciousMetals: 0 }
    }
  }, [myPlayer, stocks, cells, futures, diamondPrice])

  return (
    <div className="bg-secondary rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold">📊 玩家 ({players.length})</h2>
        {mode === 'singleplayer' && targetAssets > 0 && (
          <span className="text-xs text-gold">目标 ${(targetAssets / 10000).toFixed(0)}万</span>
        )}
      </div>

      {/* 自己信息 - 详细 */}
      {myPlayer && assetDetails && (
        <div className="bg-primary rounded-lg p-2 mb-3 border-2 border-accent">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: myPlayer.color }} />
            <span className="font-bold text-xs">{myPlayer.name} (你)</span>
            {passedBankBadge(myPlayer.passedBank)}
          </div>

          {/* 资产明细 */}
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">💵 现金</span>
              <span className="text-green-400 font-bold">${assetDetails.cash.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">🏦 存款</span>
              <span className="text-blue-400 font-bold">${assetDetails.deposit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">💎 × {assetDetails.diamonds} @${Math.round(assetDetails.diamondPrice).toLocaleString()}</span>
              <span className="text-yellow-300 font-bold">${Math.round(assetDetails.diamondsValue).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">✨ 吸引力</span>
              <span className="text-pink-300 font-bold">{(myPlayer.attraction || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">📈 股票 × {assetDetails.myStocks.length}</span>
              <span className="text-cyan-400 font-bold">${Math.round(assetDetails.stockValue).toLocaleString()}</span>
            </div>
            {assetDetails.shortValue > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">📉 做空中</span>
                <span className="text-orange-400 font-bold">${Math.round(assetDetails.shortValue).toLocaleString()}</span>
              </div>
            )}
            {assetDetails.futuresValue > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">🛢️ 期货多</span>
                <span className="text-yellow-400 font-bold">${Math.round(assetDetails.futuresValue).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">🏘️ 地产 × {myPlayer.properties.length}{assetDetails.auctionCount > 0 ? `（含${assetDetails.auctionCount}拍卖🏷️）` : ''}</span>
              <span className="text-green-300 font-bold">${Math.round(assetDetails.propertyValue).toLocaleString()}</span>
            </div>
            {/* 建材库存（按期货市场价计算） */}
            {(assetDetails.materials.cement > 0 || assetDetails.materials.steel > 0 || assetDetails.materials.rubber > 0 || assetDetails.materials.preciousMetals > 0) && (
              <div className="flex justify-between text-[10px] bg-stone-900/30 rounded px-1 py-0.5">
                <span className="text-gray-400">
                  🧱水泥{assetDetails.materials.cement}@${assetDetails.cementPrice.toFixed(0)}
                  {' '}钢{assetDetails.materials.steel}@${assetDetails.steelPrice.toFixed(0)}
                  {' '}胶{assetDetails.materials.rubber}@${assetDetails.rubberPrice.toFixed(0)}
                  {assetDetails.materials.preciousMetals > 0 && ` 🥇${assetDetails.materials.preciousMetals}@$${assetDetails.goldPrice.toFixed(0)}`}
                </span>
                <span className="text-stone-300 font-bold">${Math.round(assetDetails.materialsValue).toLocaleString()}</span>
              </div>
            )}
            {assetDetails.loanDebt > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">💳 贷款</span>
                <span className="text-red-400 font-bold">-${assetDetails.loanDebt.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-gray-700 pt-1 mt-1 flex justify-between">
              <span className="text-gray-300 font-bold">📊 总资产</span>
              <span className="text-gold font-bold text-sm">${Math.round(assetDetails.total).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* 其他玩家 */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {players.filter(p => p.id !== myPlayerId).map(player => (
          <div
            key={player.id}
            className={`bg-primary rounded-lg p-2 ${player.isBankrupt ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: player.color }} />
                <span className={`text-xs ${player.isBankrupt ? 'line-through text-gray-500' : ''}`}>
                  {player.name}
                  {player.isAI && ' 🤖'}
                </span>
              </div>
              <span className="text-xs text-gold font-bold">
                ${(player.totalAssets ?? 0).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>💵${formatMoney(player.cash)}</span>
              <span>🏦${formatMoney(player.deposit)}</span>
              <span>💎{player.diamonds}</span>
              <span>🏘️{player.properties.length}</span>
              <span>📈{player.stocks.length}</span>
            </div>
            {player.isBankrupt && (
              <div className="text-xs text-red-400 mt-1">已破产</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function passedBankBadge(passed: boolean) {
  return passed ? (
    <span className="px-1.5 py-0.5 bg-green-600/30 text-green-400 text-[10px] rounded">🏦在银行</span>
  ) : null
}