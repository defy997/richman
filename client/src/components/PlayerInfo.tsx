import { useGameStore } from '../store/gameStore'

export default function PlayerInfo() {
  const { players, myPlayerId } = useGameStore()

  const myPlayer = players.find(p => p.id === myPlayerId)

  const formatMoney = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`
    return amount.toString()
  }

  return (
    <div className="bg-secondary rounded-xl p-4">
      <h2 className="text-lg font-bold mb-4">玩家</h2>
      
      {/* Self Info */}
      {myPlayer && (
        <div className="bg-primary rounded-lg p-3 mb-4 border border-accent">
          <div className="flex items-center gap-2 mb-2">
            <div 
              className="w-6 h-6 rounded-full" 
              style={{ backgroundColor: myPlayer.color }}
            />
            <span className="font-bold">{myPlayer.name} (你)</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center">
              <div className="text-gray-400">现金</div>
              <div className="text-green-400 font-bold">${formatMoney(myPlayer.cash)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">存款</div>
              <div className="text-blue-400 font-bold">${formatMoney(myPlayer.deposit)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">钻石</div>
              <div className="text-gold font-bold">{myPlayer.diamonds} 💎</div>
            </div>
          </div>
        </div>
      )}

      {/* Other Players */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {players.filter(p => p.id !== myPlayerId).map(player => (
          <div 
            key={player.id} 
            className={`bg-primary rounded-lg p-2 ${player.isBankrupt ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full" 
                  style={{ backgroundColor: player.color }}
                />
                <span className={player.isBankrupt ? 'line-through text-gray-500' : ''}>
                  {player.name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-green-400">${formatMoney(player.cash)}</span>
                <span className="text-blue-400">${formatMoney(player.deposit)}</span>
                <span className="text-gold">{player.diamonds}💎</span>
              </div>
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
