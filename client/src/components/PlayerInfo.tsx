import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'

export default function PlayerInfo() {
  const { players, myPlayerId, mode, targetAssets, cells, stocks } = useGameStore()

  const myPlayer = players.find(p => p.id === myPlayerId)

  const formatMoney = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`
    return amount.toString()
  }

  // 计算我的资产明细
  const assetDetails = useMemo(() => {
    if (!myPlayer) return null

    // 现金
    const cash = myPlayer.cash

    // 存款
    const deposit = myPlayer.deposit

    // 钻石 (按 $100/颗 估值)
    const diamondsValue = myPlayer.diamonds * 100

    // 股票市值
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
        // 做空市值估算：当前价 * 空头数量（成本估算）
        shortValue += stock.price * (h.shortQuantity || 0)
      }
    })
    stockValue = longValue

    // 期货（占位：暂无期货持仓记录）
    const futuresValue = 0

    // 地产价值
    let propertyValue = 0
    myPlayer.properties.forEach(cellId => {
      const cell = cells[cellId]
      if (cell) {
        // 升级后的房产价值更高
        propertyValue += cell.basePrice * (1 + (cell.level || 0) * 0.5)
      }
    })

    // 贷款扣除
    const loanDebt = myPlayer.loans.reduce((sum, l) => sum + l.amount + Math.floor(l.amount * l.interestRate), 0)

    const total = cash + deposit + diamondsValue + stockValue + propertyValue - loanDebt

    return {
      cash, deposit, diamondsValue, diamonds: myPlayer.diamonds,
      stockValue, longValue, shortValue, futuresValue, propertyValue,
      loanDebt, myStocks, total
    }
  }, [myPlayer, stocks, cells])

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
              <span className="text-gray-400">💎 钻石 × {assetDetails.diamonds}</span>
              <span className="text-yellow-300 font-bold">${assetDetails.diamondsValue.toLocaleString()}</span>
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
            <div className="flex justify-between">
              <span className="text-gray-400">🏘️ 地产 × {myPlayer.properties.length}</span>
              <span className="text-green-300 font-bold">${Math.round(assetDetails.propertyValue).toLocaleString()}</span>
            </div>
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