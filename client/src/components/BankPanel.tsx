import { useState, useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { createPortal } from 'react-dom'

export default function BankPanel() {
  const { socket, players, myPlayerId, cells } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [amount, setAmount] = useState(0)

  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex)
  const isMyTurn = players[currentPlayerIndex]?.id === myPlayerId
  const myPlayer = players.find(p => p.id === myPlayerId)
  const passedBank = myPlayer?.passedBank || false

  const handleDeposit = () => {
    if (!isMyTurn || !passedBank || amount <= 0) return
    socket?.emit('bankDeposit', { amount })
    setAmount(0)
  }

  const handleWithdraw = () => {
    if (!isMyTurn || !passedBank || amount <= 0) return
    socket?.emit('bankWithdraw', { amount })
    setAmount(0)
  }

  const handleRepay = (loanId: string) => {
    if (!isMyTurn) return
    socket?.emit('repayLoan', { loanId })
  }

  const handleTakeLoan = () => {
    if (!isMyTurn || !passedBank || amount <= 0) return
    socket?.emit('takeLoan', { amount })
    setAmount(0)
  }

  // 房产估值 = sum(basePrice * (1 + level * 0.5))
  const propertyValue = useMemo(() => {
    if (!myPlayer) return 0
    return myPlayer.properties.reduce((sum, cellId) => {
      const cell = cells[cellId]
      if (!cell) return sum
      return sum + cell.basePrice * (1 + cell.level * 0.5)
    }, 0)
  }, [myPlayer?.properties, cells])

  const maxLoan = Math.floor(propertyValue * 10)

  return (
    <>
      <div className="p-3">
        <div
          className="bg-primary rounded-lg p-2 cursor-pointer hover:bg-primary/80 transition-colors"
          onClick={(e) => { e.stopPropagation(); setIsOpen(true) }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏦</span>
              <span className="text-sm font-bold">银行</span>
            </div>
            <span className="text-xs text-gray-400">
              {passedBank ? '✅ 可用' : '需在银行地块'}
            </span>
          </div>
          <div className="mt-1 flex gap-3 text-xs">
            <span className="text-green-400">💵 ${myPlayer?.cash.toLocaleString()}</span>
            <span className="text-blue-400">🏦 ${myPlayer?.deposit.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {isOpen && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{ width: '600px', maxWidth: '95vw', maxHeight: '90vh' }}
            className="bg-secondary rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-primary/50 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏦</span>
                <span className="text-sm font-bold">银行</span>
                {passedBank ? (
                  <span className="px-2 py-0.5 bg-green-600/30 text-green-400 text-xs rounded">✅ 在银行</span>
                ) : (
                  <span className="px-2 py-0.5 bg-red-600/30 text-red-400 text-xs rounded">⚠️ 需站在银行地块</span>
                )}
              </div>
              <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-lg">×</button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 60px)' }}>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-primary rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">现金</div>
                  <div className="text-green-400 font-bold text-lg">${myPlayer?.cash.toLocaleString()}</div>
                </div>
                <div className="bg-primary rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">存款</div>
                  <div className="text-blue-400 font-bold text-lg">${myPlayer?.deposit.toLocaleString()}</div>
                </div>
                <div className="bg-primary rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">贷款</div>
                  <div className="text-red-400 font-bold text-lg">
                    ${(myPlayer?.loans || []).reduce((sum, l) => sum + l.amount + Math.floor(l.amount * l.interestRate), 0).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="bg-primary rounded-lg p-4 space-y-3">
                <div className="text-sm font-bold text-blue-400">💱 现金 ↔ 存款</div>
                {!passedBank && (
                  <div className="text-xs text-yellow-400 bg-yellow-900/30 rounded p-2">
                    ⚠️ 必须站在银行地块（地块5）才能使用
                  </div>
                )}
                {passedBank && (
                  <>
                    <div className="flex gap-1">
                      {[500, 1000, 5000, 10000].map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAmount(a)}
                          className={`flex-1 py-1 text-xs rounded ${amount === a ? 'bg-accent text-white' : 'bg-gray-700'}`}
                        >
                          ${a >= 1000 ? `${a/1000}K` : a}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      value={amount || ''}
                      onChange={e => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 bg-secondary rounded text-sm"
                      placeholder="输入金额 (1%手续费)"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleDeposit}
                        disabled={!isMyTurn || !myPlayer || myPlayer.cash < amount || amount <= 0}
                        className={`py-2 text-sm rounded-lg font-bold ${
                          isMyTurn && myPlayer && myPlayer.cash >= amount && amount > 0
                            ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        存钱
                      </button>
                      <button
                        type="button"
                        onClick={handleWithdraw}
                        disabled={!isMyTurn || !myPlayer || myPlayer.deposit < amount || amount <= 0}
                        className={`py-2 text-sm rounded-lg font-bold ${
                          isMyTurn && myPlayer && myPlayer.deposit >= amount && amount > 0
                            ? 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        取钱
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 text-center">手续费 1%</div>
                  </>
                )}
              </div>

              <div className="bg-primary rounded-lg p-4 space-y-3">
                <div className="text-sm font-bold text-red-400">💰 贷款 (月利率5%，30天到期，随时可还)</div>
                {(!myPlayer?.properties.length || myPlayer.properties.length === 0) ? (
                  <div className="text-xs text-red-400 bg-red-900/30 rounded p-2">
                    ⚠️ 需要拥有至少1块地皮才能贷款
                  </div>
                ) : passedBank ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>房产估值: <span className="text-yellow-400 font-bold">${Math.round(propertyValue).toLocaleString()}</span></div>
                      <div>可贷(×10): <span className="text-green-400 font-bold">${maxLoan.toLocaleString()}</span></div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {[1000, 5000, 10000, 20000, 50000].filter(a => a <= maxLoan).map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAmount(a)}
                          className={`flex-1 min-w-[60px] py-1 text-xs rounded ${amount === a ? 'bg-red-600 text-white' : 'bg-gray-700'}`}
                        >
                          ${a >= 1000 ? `${a/1000}K` : a}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setAmount(maxLoan)}
                        className={`flex-1 min-w-[60px] py-1 text-xs rounded ${amount === maxLoan ? 'bg-red-600 text-white' : 'bg-gray-700'}`}
                      >
                        全部
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleTakeLoan}
                      disabled={!isMyTurn || !passedBank || amount <= 0 || amount > maxLoan}
                      className={`w-full py-2 text-sm rounded-lg font-bold ${
                        isMyTurn && passedBank && amount > 0 && amount <= maxLoan
                          ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      贷款 ${amount.toLocaleString()}
                    </button>
                  </>
                ) : (
                  <div className="text-xs text-yellow-400 bg-yellow-900/30 rounded p-2">
                    ⚠️ 必须站在银行地块才能贷款
                  </div>
                )}
              </div>

              {(myPlayer?.loans || []).length > 0 && (
                <div className="bg-primary rounded-lg p-4 space-y-2">
                  <div className="text-sm font-bold text-orange-400">📋 未还贷款</div>
                  {(myPlayer?.loans || []).map(loan => {
                    const daysElapsed = 30 - loan.turnsRemaining
                    const interest = Math.floor(loan.amount * loan.interestRate * Math.min(daysElapsed, 30) / 30)
                    return (
                      <div key={loan.id} className="bg-secondary rounded p-3 flex items-center justify-between">
                        <div>
                          <div className="text-red-400 font-bold text-sm">
                            ${loan.amount} + 利息 ${interest}
                          </div>
                          <div className="text-xs text-gray-500">
                            剩余 {loan.turnsRemaining} 回合到期
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRepay(loan.id)}
                          disabled={!isMyTurn}
                          className={`px-4 py-2 rounded-lg text-sm font-bold ${
                            isMyTurn
                              ? 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          还款
                        </button>
                      </div>
                    )
                  })}
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
