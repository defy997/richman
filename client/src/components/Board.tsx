import { useGameStore } from '../store/gameStore'

export default function Board() {
  const { cells, players, selectedCell, updateGameState } = useGameStore()

  const handleCellClick = (cellId: number) => {
    updateGameState({ selectedCell: selectedCell === cellId ? null : cellId })
  }

  const getCellColor = (cell: typeof cells[0]) => {
    if (cell.type === 'start') return 'bg-green-600'
    if (cell.type === 'bank') return 'bg-blue-600'
    if (cell.type === 'stock') return 'bg-yellow-600'
    if (cell.type === 'chance') return 'bg-purple-600'
    if (cell.type === 'destiny') return 'bg-orange-600'
    if (cell.type === 'diamond') return 'bg-pink-500'
    if (cell.owner) {
      const owner = players.find(p => p.id === cell.owner)
      return owner ? '' : ''
    }
    return 'bg-gray-700 hover:bg-gray-600'
  }

  const getPlayersOnCell = (cellId: number) => {
    return players.filter(p => p.position === cellId && !p.isBankrupt)
  }

  return (
    <div className="bg-secondary rounded-xl p-6">
      <div className="grid grid-cols-9 gap-1 max-w-4xl mx-auto">
        {/* Top Row */}
        {cells.slice(0, 9).map((cell, index) => {
          const playersHere = getPlayersOnCell(index)
          return (
            <div
              key={cell.id}
              onClick={() => handleCellClick(index)}
              className={`
                w-16 h-16 rounded-lg flex flex-col items-center justify-center cursor-pointer
                transition-all relative
                ${getCellColor(cell)}
                ${selectedCell === index ? 'ring-2 ring-accent' : ''}
                ${cell.owner ? 'border-2' : 'border border-gray-600'}
              `}
              style={cell.owner ? { 
                borderColor: players.find(p => p.id === cell.owner)?.color,
                backgroundColor: `${players.find(p => p.id === cell.owner)?.color}33`
              } : {}}
            >
              <span className="text-xs font-bold">{cell.name}</span>
              {cell.price && (
                <span className="text-xs text-gray-400">${cell.price}</span>
              )}
              {cell.level > 0 && (
                <span className="text-xs text-gold">Lv.{cell.level}</span>
              )}
              {playersHere.length > 0 && (
                <div className="absolute -bottom-1 -right-1 flex">
                  {playersHere.slice(0, 4).map((p, i) => (
                    <div
                      key={p.id}
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ 
                        backgroundColor: p.color,
                        marginLeft: i > 0 ? -8 : 0,
                        zIndex: i
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Left Column */}
        <div className="contents">
          {[17, 16, 15, 14, 13, 12, 11, 10].map(index => {
            const cell = cells[index]
            const playersHere = getPlayersOnCell(index)
            return (
              <div
                key={cell.id}
                onClick={() => handleCellClick(index)}
                className={`
                  w-16 h-16 rounded-lg flex flex-col items-center justify-center cursor-pointer
                  transition-all relative
                  ${getCellColor(cell)}
                  ${selectedCell === index ? 'ring-2 ring-accent' : ''}
                  ${cell.owner ? 'border-2' : 'border border-gray-600'}
                `}
                style={cell.owner ? { 
                  borderColor: players.find(p => p.id === cell.owner)?.color,
                  backgroundColor: `${players.find(p => p.id === cell.owner)?.color}33`
                } : {}}
              >
                <span className="text-xs font-bold">{cell.name}</span>
                {cell.price && (
                  <span className="text-xs text-gray-400">${cell.price}</span>
                )}
                {cell.level > 0 && (
                  <span className="text-xs text-gold">Lv.{cell.level}</span>
                )}
                {playersHere.length > 0 && (
                  <div className="absolute -bottom-1 -right-1 flex">
                    {playersHere.slice(0, 4).map((p, i) => (
                      <div
                        key={p.id}
                        className="w-4 h-4 rounded-full border border-white"
                        style={{ 
                          backgroundColor: p.color,
                          marginLeft: i > 0 ? -8 : 0,
                          zIndex: i
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Bottom Row (reversed) */}
        {cells.slice(18, 27).reverse().map((cell, idx) => {
          const realIndex = 26 - idx
          const playersHere = getPlayersOnCell(realIndex)
          return (
            <div
              key={cell.id}
              onClick={() => handleCellClick(realIndex)}
              className={`
                w-16 h-16 rounded-lg flex flex-col items-center justify-center cursor-pointer
                transition-all relative
                ${getCellColor(cell)}
                ${selectedCell === realIndex ? 'ring-2 ring-accent' : ''}
                ${cell.owner ? 'border-2' : 'border border-gray-600'}
              `}
              style={cell.owner ? { 
                borderColor: players.find(p => p.id === cell.owner)?.color,
                backgroundColor: `${players.find(p => p.id === cell.owner)?.color}33`
              } : {}}
            >
              <span className="text-xs font-bold">{cell.name}</span>
              {cell.price && (
                <span className="text-xs text-gray-400">${cell.price}</span>
              )}
              {cell.level > 0 && (
                <span className="text-xs text-gold">Lv.{cell.level}</span>
              )}
              {playersHere.length > 0 && (
                <div className="absolute -bottom-1 -right-1 flex">
                  {playersHere.slice(0, 4).map((p, i) => (
                    <div
                      key={p.id}
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ 
                        backgroundColor: p.color,
                        marginLeft: i > 0 ? -8 : 0,
                        zIndex: i
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Right Column */}
        {[19, 20, 21, 22, 23, 24, 25, 9].map(index => {
          const cell = cells[index]
          const playersHere = getPlayersOnCell(index)
          return (
            <div
              key={cell.id}
              onClick={() => handleCellClick(index)}
              className={`
                w-16 h-16 rounded-lg flex flex-col items-center justify-center cursor-pointer
                transition-all relative
                ${getCellColor(cell)}
                ${selectedCell === index ? 'ring-2 ring-accent' : ''}
                ${cell.owner ? 'border-2' : 'border border-gray-600'}
              `}
              style={cell.owner ? { 
                borderColor: players.find(p => p.id === cell.owner)?.color,
                backgroundColor: `${players.find(p => p.id === cell.owner)?.color}33`
              } : {}}
            >
              <span className="text-xs font-bold">{cell.name}</span>
              {cell.price && (
                <span className="text-xs text-gray-400">${cell.price}</span>
              )}
              {cell.level > 0 && (
                <span className="text-xs text-gold">Lv.{cell.level}</span>
              )}
              {playersHere.length > 0 && (
                <div className="absolute -bottom-1 -right-1 flex">
                  {playersHere.slice(0, 4).map((p, i) => (
                    <div
                      key={p.id}
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ 
                        backgroundColor: p.color,
                        marginLeft: i > 0 ? -8 : 0,
                        zIndex: i
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
