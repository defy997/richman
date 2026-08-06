import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

export default function BankPanel() {
  const { socket, myPlayerId, players, cells, selectedCell } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [action, setAction] = useState<'cashToDeposit' | 'depositToCash' | 'upgrade' | 'buy' | 'loan'>('cashToDeposit')
  const [amount, setAmount] = useState(0)

  const myPlayer = players.find(p => p.id === myPlayerId)
  const selectedProperty = selectedCell !== null ? cells[selectedCell] : null

  const canUpgrade = selectedProperty?.owner === myPlayerId && (selectedProperty?.level || 0) < 4
  const upgradeCost = selectedProperty ? Math.floor(selectedProperty.basePrice * 0.5) : 0

  const handleConvert = () => {
    if (amount <= 0) return
    
    if (action === 'cashToDeposit' && myPlayer && myPlayer.cash < amount) {
      return
    }
    if (action === 'depositToCash' && myPlayer && myPlayer.deposit < amount) {
      return
    }
    
    socket?.emit('bankConvert', { action, amount })
    setAmount(0)
  }

  const handleUpgrade = () => {
    if (!selectedProperty || !canUpgrade) return
    socket?.emit('upgradeProperty', { cellId: selectedProperty.id })
  }

  const handleBuyProperty = () => {
    if (!selectedProperty || selectedProperty.owner) return
    socket?.emit('buyProperty', { cellId: selectedProperty.id })
  }

  const handleLoan = () => {
    if (amount <= 0) return
    socket?.emit('takeLoan', { amount })
    setAmount(0)
  }

  return (
    <div className="bg-secondary rounded-xl p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="text-lg font-bold">银行</h2>
        <span className="text-gray-400">{isOpen ? '▼' : '▶'}</span>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-4">
          {/* Cash <-> Deposit */}
          <div className="bg-primary rounded-lg p-3 space-y-3">
            <h3 className="text-sm font-bold">现金/存款转换</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAction('cashToDeposit')}
                className={`
                  py-2 rounded text-sm font-bold
                  ${action === 'cashToDeposit' ? 'bg-blue-600' : 'bg-gray-700'}
                `}
              >
                现金→存款
              </button>
              <button
                onClick={() => setAction('depositToCash')}
                className={`
                  py-2 rounded text-sm font-bold
                  ${action === 'depositToCash' ? 'bg-blue-600' : 'bg-gray-700'}
                `}
              >
                存款→现金
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
                className="flex-1 px-3 py-2 bg-secondary rounded"
                placeholder="金额"
              />
              <button
                onClick={handleConvert}
                className="px-4 py-2 bg-accent hover:bg-red-600 rounded font-bold"
              >
                转换
              </button>
            </div>
          </div>

          {/* Property Actions */}
          {selectedProperty && selectedProperty.type === 'empty' && (
            <div className="bg-primary rounded-lg p-3 space-y-3">
              <h3 className="text-sm font-bold">地皮: {selectedProperty.name}</h3>
              
              {!selectedProperty.owner && (
                <div className="flex justify-between items-center">
                  <span>价格: ${selectedProperty.price}</span>
                  <button
                    onClick={handleBuyProperty}
                    disabled={myPlayer && myPlayer.cash < (selectedProperty.price || 0)}
                    className={`
                      px-4 py-2 rounded font-bold
                      ${myPlayer && myPlayer.cash >= (selectedProperty.price || 0)
                        ? 'bg-accent hover:bg-red-600'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
                    `}
                  >
                    购买
                  </button>
                </div>
              )}

              {selectedProperty.owner === myPlayerId && canUpgrade && (
                <div className="flex justify-between items-center">
                  <span>升级 (Lv.{selectedProperty.level}→{selectedProperty.level + 1}): ${upgradeCost}</span>
                  <button
                    onClick={handleUpgrade}
                    disabled={myPlayer && myPlayer.cash < upgradeCost}
                    className={`
                      px-4 py-2 rounded font-bold
                      ${myPlayer && myPlayer.cash >= upgradeCost
                        ? 'bg-accent hover:bg-red-600'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
                    `}
                  >
                    升级
                  </button>
                </div>
              )}

              {selectedProperty.level >= 4 && selectedProperty.owner === myPlayerId && (
                <div className="text-gold text-sm">已达最高等级!</div>
              )}
            </div>
          )}

          {/* Loan */}
          <div className="bg-primary rounded-lg p-3 space-y-3">
            <h3 className="text-sm font-bold">贷款</h3>
            <div className="text-xs text-gray-400">
              可贷额度: ${myPlayer ? Math.floor(myPlayer.deposit * 0.5) : 0}
              <br />
              利率: 10%
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
                className="flex-1 px-3 py-2 bg-secondary rounded"
                placeholder="贷款金额"
              />
              <button
                onClick={handleLoan}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold"
              >
                贷款
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
