import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'

const app = express()
app.use(cors())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Types
interface Player {
  id: string
  socketId: string
  name: string
  color: string
  cash: number
  deposit: number
  diamonds: number
  position: number
  properties: number[]
  isBankrupt: boolean
  cards: string[]
  stocks: StockHolding[]
  stayTurns: number
}

interface StockHolding {
  symbol: string
  quantity: number
  avgCost: number
  shortQuantity: number
  shortAvgCost: number
}

interface Cell {
  id: number
  type: 'empty' | 'chance' | 'destiny' | 'diamond' | 'start' | 'bank' | 'stock'
  name: string
  price: number
  owner: string | null
  level: number
  basePrice: number
}

interface Stock {
  symbol: string
  name: string
  price: number
  change: number
  trend: 'up' | 'down' | null
  trendDays: number
}

interface GameRoom {
  code: string
  players: Player[]
  cells: Cell[]
  stocks: Stock[]
  currentPlayerIndex: number
  currentTurn: number
  phase: 'lobby' | 'playing' | 'ended'
  diceValue: number | null
  forcedDice: number | null
  stayCurrentTurn: boolean
}

// Constants
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22']
const INITIAL_CASH = 5000
const INITIAL_DEPOSIT = 3000
const INITIAL_DIAMONDS = 10
const START_BONUS = 500

// Game State
const rooms = new Map<string, GameRoom>()

// Stock Names
const STOCK_NAMES = [
  '科技', '金融', '能源', '医疗', '消费', '工业', '通信', '地产',
  '农业', '军工', '教育', '娱乐', '交通', '物流', '材料'
]

// Generate random board
function generateCells(): Cell[] {
  const cellTypes: Cell['type'][] = ['empty', 'empty', 'empty', 'empty', 'empty', 'empty',
    'chance', 'empty', 'empty', 'destiny',
    'empty', 'empty', 'empty', 'bank', 'empty',
    'empty', 'chance', 'empty', 'empty', 'destiny',
    'empty', 'stock', 'empty', 'empty', 'empty',
    'empty', 'empty', 'chance', 'diamond', 'destiny',
    'empty', 'empty', 'empty', 'empty', 'empty',
    'empty', 'empty', 'empty', 'empty', 'start'
  ]

  return cellTypes.map((type, i) => {
    let name = ''
    let price = 0
    let basePrice = 0

    switch (type) {
      case 'start':
        name = '起点'
        break
      case 'bank':
        name = '银行'
        break
      case 'stock':
        name = '股票交易所'
        break
      case 'chance':
        name = '机会'
        break
      case 'destiny':
        name = '命运'
        break
      case 'diamond':
        name = '钻石'
        break
      case 'empty':
        name = `地块${i}`
        basePrice = Math.floor(Math.random() * 1500) + 500
        price = basePrice
        break
    }

    return {
      id: i,
      type,
      name,
      price,
      owner: null,
      level: 0,
      basePrice
    }
  })
}

// Generate stocks
function generateStocks(): Stock[] {
  return STOCK_NAMES.map((name, i) => ({
    symbol: `STK${String(i + 1).padStart(2, '0')}`,
    name,
    price: Math.floor(Math.random() * 900) + 100,
    change: 0,
    trend: null,
    trendDays: 0
  }))
}

// Generate room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Broadcast room state
function broadcastRoomState(room: GameRoom) {
  const state = {
    roomCode: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      cash: p.cash,
      deposit: p.deposit,
      diamonds: p.diamonds,
      position: p.position,
      properties: p.properties,
      isBankrupt: p.isBankrupt,
      cards: p.cards,
      stocks: p.stocks,
      isCurrentTurn: room.players.indexOf(p) === room.currentPlayerIndex
    })),
    cells: room.cells,
    stocks: room.stocks,
    currentPlayerIndex: room.currentPlayerIndex,
    currentTurn: room.currentTurn,
    gamePhase: room.phase,
    diceValue: room.diceValue,
    forcedDice: room.forcedDice
  }
  io.to(room.code).emit('gameState', state)
}

// Send message to room
function sendMessage(room: GameRoom, type: 'info' | 'warning' | 'success' | 'error', content: string) {
  io.to(room.code).emit('message', { type, content })
}

// Process cell event
function processCellEvent(room: GameRoom, player: Player) {
  const cell = room.cells[player.position]

  switch (cell.type) {
    case 'start':
      player.cash += START_BONUS
      sendMessage(room, 'info', `${player.name} 经过起点，获得 $${START_BONUS}`)
      break

    case 'chance':
      const chanceEvent = Math.random()
      if (chanceEvent < 0.3) {
        player.cash += 500
        sendMessage(room, 'success', `${player.name} 抽到机会卡，获得 $500`)
      } else if (chanceEvent < 0.6) {
        player.cash -= 300
        sendMessage(room, 'warning', `${player.name} 抽到机会卡，损失 $300`)
      } else if (chanceEvent < 0.8) {
        player.diamonds += 2
        sendMessage(room, 'success', `${player.name} 抽到机会卡，获得 2💎`)
      } else {
        const randomPlayer = room.players.find(p => p.id !== player.id && !p.isBankrupt)
        if (randomPlayer) {
          randomPlayer.cash -= 200
          player.cash += 200
          sendMessage(room, 'info', `${player.name} 抽到机会卡，从 ${randomPlayer.name} 抢走 $200`)
        }
      }
      break

    case 'destiny':
      const destinyEvent = Math.random()
      if (destinyEvent < 0.3) {
        player.cash -= 500
        sendMessage(room, 'warning', `${player.name} 命运不佳，损失 $500`)
      } else if (destinyEvent < 0.5) {
        player.deposit += 1000
        sendMessage(room, 'success', `${player.name} 命运眷顾，存款 +$1000`)
      } else if (destinyEvent < 0.7) {
        player.position = 0
        player.cash += START_BONUS
        sendMessage(room, 'info', `${player.name} 命运降临，回到起点`)
      } else {
        player.diamonds += 1
        sendMessage(room, 'success', `${player.name} 命运眷顾，获得 1💎`)
      }
      break

    case 'diamond':
      player.diamonds += 1
      sendMessage(room, 'success', `${player.name} 来到钻石格，获得 1💎`)
      break

    case 'empty':
      if (cell.owner && cell.owner !== player.id) {
        const owner = room.players.find(p => p.id === cell.owner)
        if (owner && !owner.isBankrupt) {
          const fee = cell.basePrice * Math.pow(2, cell.level)
          if (player.cash >= fee) {
            player.cash -= fee
            owner.cash += fee
            sendMessage(room, 'info', `${player.name} 支付过路费 $${fee} 给 ${owner.name}`)
          } else {
            // Not enough cash, go bankrupt
            player.isBankrupt = true
            owner.cash += player.cash
            owner.deposit += player.deposit
            player.cash = 0
            player.deposit = 0
            sendMessage(room, 'error', `${player.name} 现金不足，破产!`)
          }
        }
      }
      break
  }

  // Check bankruptcy
  if (player.cash + player.deposit < 0) {
    player.isBankrupt = true
    // Transfer properties back to bank
    player.properties.forEach(propId => {
      room.cells[propId].owner = null
      room.cells[propId].level = 0
    })
    sendMessage(room, 'error', `${player.name} 破产了!`)
  }
}

// Next player
function nextPlayer(room: GameRoom) {
  // Check for bankruptcy and remove
  room.players = room.players.filter(p => !p.isBankrupt)
  
  // Check win condition
  if (room.players.length <= 1) {
    room.phase = 'ended'
    sendMessage(room, 'success', `${room.players[0].name} 获得胜利!`)
    broadcastRoomState(room)
    return
  }

  // Move to next player
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length
  
  // If current player is bankrupt, skip
  const currentPlayer = room.players[room.currentPlayerIndex]
  if (currentPlayer.isBankrupt) {
    nextPlayer(room)
    return
  }

  // Reset dice
  room.diceValue = null
  room.forcedDice = null

  // Check stay turns
  if (currentPlayer.stayTurns > 0) {
    currentPlayer.stayTurns--
    room.stayCurrentTurn = true
    sendMessage(room, 'info', `${currentPlayer.name} 被停留卡影响，本回合无法行动`)
  } else {
    room.stayCurrentTurn = false
  }

  // Increment turn every round
  if (room.currentPlayerIndex === 0) {
    room.currentTurn++
    // Update stock prices
    updateStockPrices(room)
  }

  broadcastRoomState(room)
}

// Update stock prices
function updateStockPrices(room: GameRoom) {
  room.stocks.forEach(stock => {
    // Process trend
    if (stock.trendDays > 0) {
      stock.trendDays--
      if (stock.trendDays === 0) {
        stock.trend = null
      }
    }

    // Calculate new price
    let changePercent: number
    if (stock.trend === 'up') {
      changePercent = Math.random() * 8 + 3 // 3-11%
    } else if (stock.trend === 'down') {
      changePercent = -(Math.random() * 8 + 3) // -3 to -11%
    } else {
      changePercent = (Math.random() - 0.4) * 25 // -10% to +15%
    }

    const oldPrice = stock.price
    stock.price = Math.max(10, Math.round(stock.price * (1 + changePercent / 100)))
    stock.change = ((stock.price - oldPrice) / oldPrice) * 100

    // Process shorts
    room.players.forEach(player => {
      const holding = player.stocks.find(s => s.symbol === stock.symbol)
      if (holding && holding.shortQuantity > 0) {
        const shortProfit = (oldPrice - stock.price) * holding.shortQuantity
        player.cash += shortProfit
        if (shortProfit > 0) {
          sendMessage(room, 'success', `${player.name} 做空 ${stock.symbol} 获利 $${Math.round(shortProfit)}`)
        } else {
          sendMessage(room, 'warning', `${player.name} 做空 ${stock.symbol} 亏损 $${Math.round(-shortProfit)}`)
        }
      }
    })
  })
}

// Socket handlers
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  let currentRoom: GameRoom | null = null

  socket.on('createRoom', ({ playerName }) => {
    const code = generateRoomCode()
    const room: GameRoom = {
      code,
      players: [{
        id: socket.id,
        socketId: socket.id,
        name: playerName,
        color: PLAYER_COLORS[0],
        cash: INITIAL_CASH,
        deposit: INITIAL_DEPOSIT,
        diamonds: INITIAL_DIAMONDS,
        position: 0,
        properties: [],
        isBankrupt: false,
        cards: [],
        stocks: [],
        stayTurns: 0
      }],
      cells: generateCells(),
      stocks: generateStocks(),
      currentPlayerIndex: 0,
      currentTurn: 1,
      phase: 'lobby',
      diceValue: null,
      forcedDice: null,
      stayCurrentTurn: false
    }
    
    rooms.set(code, room)
    socket.join(code)
    currentRoom = room
    
    socket.emit('roomCreated', { roomCode: code, playerId: socket.id })
    broadcastRoomState(room)
  })

  socket.on('joinRoom', ({ playerName, roomCode }) => {
    const room = rooms.get(roomCode)
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' })
      return
    }

    if (room.phase !== 'lobby') {
      socket.emit('error', { message: '游戏已开始' })
      return
    }

    if (room.players.length >= 6) {
      socket.emit('error', { message: '房间已满' })
      return
    }

    const player: Player = {
      id: socket.id,
      socketId: socket.id,
      name: playerName,
      color: PLAYER_COLORS[room.players.length],
      cash: INITIAL_CASH,
      deposit: INITIAL_DEPOSIT,
      diamonds: INITIAL_DIAMONDS,
      position: 0,
      properties: [],
      isBankrupt: false,
      cards: [],
      stocks: [],
      stayTurns: 0
    }

    room.players.push(player)
    socket.join(roomCode)
    currentRoom = room
    
    socket.emit('roomJoined', { roomCode, playerId: socket.id })
    sendMessage(room, 'info', `${playerName} 加入了游戏`)
    broadcastRoomState(room)
  })

  socket.on('startGame', () => {
    if (!currentRoom) return
    
    if (currentRoom.players.length < 2) {
      socket.emit('error', { message: '至少需要 2 名玩家' })
      return
    }

    currentRoom.phase = 'playing'
    currentRoom.currentPlayerIndex = Math.floor(Math.random() * currentRoom.players.length)
    sendMessage(currentRoom, 'info', `游戏开始! ${currentRoom.players[currentRoom.currentPlayerIndex].name} 先手`)
    broadcastRoomState(currentRoom)
  })

  socket.on('rollDice', () => {
    if (!currentRoom) return
    
    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    if (currentRoom.diceValue !== null) {
      socket.emit('error', { message: '已经投过骰子了' })
      return
    }

    if (currentRoom.stayCurrentTurn) {
      nextPlayer(currentRoom)
      return
    }

    let diceValue: number
    if (currentRoom.forcedDice !== null) {
      diceValue = currentRoom.forcedDice
      currentRoom.forcedDice = null
    } else {
      diceValue = Math.floor(Math.random() * 6) + 1
    }

    currentRoom.diceValue = diceValue
    
    // Move player
    const newPosition = (currentPlayer.position + diceValue) % 40
    const passedStart = newPosition < currentPlayer.position
    
    currentPlayer.position = newPosition
    
    sendMessage(currentRoom, 'info', `${currentPlayer.name} 投出 ${diceValue}，移动到 ${currentRoom.cells[newPosition].name}`)
    
    if (passedStart) {
      currentPlayer.cash += START_BONUS
      sendMessage(currentRoom, 'info', `${currentPlayer.name} 经过起点，获得 $${START_BONUS}`)
    }
    
    processCellEvent(currentRoom, currentPlayer)
    broadcastRoomState(currentRoom)
  })

  socket.on('endTurn', () => {
    if (!currentRoom) return
    
    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    if (currentRoom.diceValue === null && !currentRoom.stayCurrentTurn) {
      socket.emit('error', { message: '请先投骰子' })
      return
    }

    nextPlayer(currentRoom)
  })

  socket.on('buyProperty', ({ cellId }) => {
    if (!currentRoom) return
    
    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    const cell = currentRoom.cells[cellId]
    if (!cell || cell.type !== 'empty' || cell.owner) {
      socket.emit('error', { message: '无法购买此地块' })
      return
    }

    if (currentPlayer.cash < cell.price) {
      socket.emit('error', { message: '现金不足' })
      return
    }

    currentPlayer.cash -= cell.price
    cell.owner = currentPlayer.id
    currentPlayer.properties.push(cellId)
    
    sendMessage(currentRoom, 'success', `${currentPlayer.name} 购买了 ${cell.name}，花费 $${cell.price}`)
    broadcastRoomState(currentRoom)
  })

  socket.on('upgradeProperty', ({ cellId }) => {
    if (!currentRoom) return
    
    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    const cell = currentRoom.cells[cellId]
    if (!cell || cell.owner !== currentPlayer.id) {
      socket.emit('error', { message: '无法升级此地块' })
      return
    }

    if (cell.level >= 4) {
      socket.emit('error', { message: '已达最高等级' })
      return
    }

    const upgradeCost = Math.floor(cell.basePrice * 0.5)
    if (currentPlayer.cash < upgradeCost) {
      socket.emit('error', { message: '现金不足' })
      return
    }

    currentPlayer.cash -= upgradeCost
    cell.level++
    cell.price = Math.floor(cell.basePrice * (1 + cell.level * 0.5))
    
    sendMessage(currentRoom, 'success', `${currentPlayer.name} 将 ${cell.name} 升级到 Lv.${cell.level}`)
    broadcastRoomState(currentRoom)
  })

  socket.on('bankConvert', ({ action, amount }) => {
    if (!currentRoom) return
    
    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    if (amount <= 0) {
      socket.emit('error', { message: '金额必须大于0' })
      return
    }

    if (action === 'cashToDeposit' && currentPlayer.cash < amount) {
      socket.emit('error', { message: '现金不足' })
      return
    }

    if (action === 'depositToCash' && currentPlayer.deposit < amount) {
      socket.emit('error', { message: '存款不足' })
      return
    }

    if (action === 'cashToDeposit') {
      currentPlayer.cash -= amount
      currentPlayer.deposit += amount
      sendMessage(currentRoom, 'info', `${currentPlayer.name} 将 $${amount} 转为存款`)
    } else {
      currentPlayer.deposit -= amount
      currentPlayer.cash += amount
      sendMessage(currentRoom, 'info', `${currentPlayer.name} 将 $${amount} 转为现金`)
    }
    
    broadcastRoomState(currentRoom)
  })

  socket.on('takeLoan', ({ amount }) => {
    if (!currentRoom) return
    
    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    const maxLoan = Math.floor(currentPlayer.deposit * 0.5)
    if (amount > maxLoan) {
      socket.emit('error', { message: `最多可贷款 $${maxLoan}` })
      return
    }

    currentPlayer.cash += amount
    sendMessage(currentRoom, 'info', `${currentPlayer.name} 贷款 $${amount} (利息10%)`)
    broadcastRoomState(currentRoom)
  })

  socket.on('buyCard', ({ cardName }) => {
    if (!currentRoom) return
    
    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    const cardPrices: Record<string, number> = {
      '停留卡': 40, '骰子卡': 30, '均贫卡': 100,
      '红心卡': 60, '黑心卡': 80, '占地卡': 120, '地皮升级卡': 60
    }

    const price = cardPrices[cardName]
    if (!price) {
      socket.emit('error', { message: '无效的卡片' })
      return
    }

    if (currentPlayer.diamonds < price) {
      socket.emit('error', { message: '钻石不足' })
      return
    }

    currentPlayer.diamonds -= price
    currentPlayer.cards.push(cardName)
    
    sendMessage(currentRoom, 'success', `${currentPlayer.name} 购买了 ${cardName}`)
    broadcastRoomState(currentRoom)
  })

  socket.on('useCard', ({ cardName, target }) => {
    if (!currentRoom) return
    
    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    const cardIndex = currentPlayer.cards.indexOf(cardName)
    if (cardIndex === -1) {
      socket.emit('error', { message: '没有这张卡片' })
      return
    }

    currentPlayer.cards.splice(cardIndex, 1)

    switch (cardName) {
      case '停留卡':
        if (currentRoom.diceValue !== null) {
          socket.emit('error', { message: '回合已开始，无法使用停留卡' })
          currentPlayer.cards.push(cardName)
          return
        }
        const targetPlayerIndex = (currentRoom.currentPlayerIndex + 1) % currentRoom.players.length
        currentRoom.players[targetPlayerIndex].stayTurns++
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 使用停留卡，${currentRoom.players[targetPlayerIndex].name} 下回合停留`)
        break

      case '骰子卡':
        if (typeof target !== 'number' || target < 1 || target > 6) {
          socket.emit('error', { message: '骰子点数必须在1-6之间' })
          currentPlayer.cards.push(cardName)
          return
        }
        currentRoom.forcedDice = target
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 使用骰子卡，下一次投出 ${target} 点`)
        break

      case '均贫卡':
        const totalCash = currentRoom.players.reduce((sum, p) => sum + (p.isBankrupt ? 0 : p.cash), 0)
        const avgCash = Math.floor(totalCash / currentRoom.players.filter(p => !p.isBankrupt).length)
        currentRoom.players.forEach(p => {
          if (!p.isBankrupt) {
            p.cash = avgCash
          }
        })
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 使用均贫卡，所有玩家现金变为 $${avgCash}`)
        break

      case '红心卡':
        const upStock = currentRoom.stocks.find(s => s.symbol === target)
        if (!upStock) {
          socket.emit('error', { message: '股票不存在' })
          currentPlayer.cards.push(cardName)
          return
        }
        upStock.trend = 'up'
        upStock.trendDays = 3
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 使用红心卡，${upStock.name} 连续上涨3天`)
        break

      case '黑心卡':
        const downStock = currentRoom.stocks.find(s => s.symbol === target)
        if (!downStock) {
          socket.emit('error', { message: '股票不存在' })
          currentPlayer.cards.push(cardName)
          return
        }
        downStock.trend = 'down'
        downStock.trendDays = 4
        sendMessage(currentRoom, 'warning', `${currentPlayer.name} 使用黑心卡，${downStock.name} 连续下跌4天`)
        break

      case '占地卡':
        const emptyCells = currentRoom.cells.filter(c => c.type === 'empty' && !c.owner)
        if (emptyCells.length === 0) {
          socket.emit('error', { message: '没有可占领的地皮' })
          currentPlayer.cards.push(cardName)
          return
        }
        const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)]
        randomCell.owner = currentPlayer.id
        currentPlayer.properties.push(randomCell.id)
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 使用占地卡，占领了 ${randomCell.name}`)
        break

      case '地皮升级卡':
        if (currentPlayer.properties.length === 0) {
          socket.emit('error', { message: '你没有地皮' })
          currentPlayer.cards.push(cardName)
          return
        }
        const upgradeableProp = currentPlayer.properties
          .map(id => currentRoom.cells[id])
          .find(c => c.level < 4)
        if (!upgradeableProp) {
          socket.emit('error', { message: '所有地皮都已满级' })
          currentPlayer.cards.push(cardName)
          return
        }
        upgradeableProp.level++
        upgradeableProp.price = Math.floor(upgradeableProp.basePrice * (1 + upgradeableProp.level * 0.5))
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 使用地皮升级卡，${upgradeableProp.name} 升级到 Lv.${upgradeableProp.level}`)
        break
    }

    broadcastRoomState(currentRoom)
  })

  socket.on('tradeStock', ({ symbol, action, quantity, leverage }) => {
    if (!currentRoom) return
    
    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    const stock = currentRoom.stocks.find(s => s.symbol === symbol)
    if (!stock) {
      socket.emit('error', { message: '股票不存在' })
      return
    }

    let holding = currentPlayer.stocks.find(s => s.symbol === symbol)
    if (!holding) {
      holding = { symbol, quantity: 0, avgCost: 0, shortQuantity: 0, shortAvgCost: 0 }
      currentPlayer.stocks.push(holding)
    }

    switch (action) {
      case 'buy':
        const buyCost = stock.price * quantity * leverage
        if (currentPlayer.cash < buyCost) {
          socket.emit('error', { message: '现金不足' })
          return
        }
        const newAvgCost = (holding.avgCost * holding.quantity + stock.price * quantity) / (holding.quantity + quantity)
        holding.avgCost = newAvgCost
        holding.quantity += quantity
        currentPlayer.cash -= buyCost
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 以 $${stock.price} 买入 ${quantity} 股 ${symbol}`)
        break

      case 'sell':
        if (holding.quantity < quantity) {
          socket.emit('error', { message: '持有数量不足' })
          return
        }
        const sellValue = stock.price * quantity
        const profit = (stock.price - holding.avgCost) * quantity
        holding.quantity -= quantity
        currentPlayer.cash += sellValue
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 以 $${stock.price} 卖出 ${quantity} 股 ${symbol}，${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit))}`)
        if (holding.quantity === 0) {
          holding.avgCost = 0
        }
        break

      case 'short':
        const margin = stock.price * quantity / leverage
        if (currentPlayer.deposit < margin) {
          socket.emit('error', { message: '保证金不足' })
          return
        }
        holding.shortQuantity += quantity
        holding.shortAvgCost = stock.price
        currentPlayer.cash += stock.price * quantity
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 做空 ${quantity} 股 ${symbol} at $${stock.price}`)
        break

      case 'cover':
        if (holding.shortQuantity < quantity) {
          socket.emit('error', { message: '做空数量不足' })
          return
        }
        const coverCost = stock.price * quantity
        if (currentPlayer.cash < coverCost) {
          socket.emit('error', { message: '现金不足' })
          return
        }
        holding.shortQuantity -= quantity
        currentPlayer.cash -= coverCost
        const shortProfit = (holding.shortAvgCost - stock.price) * quantity
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 平空 ${quantity} 股 ${symbol}，${shortProfit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(shortProfit))}`)
        if (holding.shortQuantity === 0) {
          holding.shortAvgCost = 0
        }
        break
    }

    broadcastRoomState(currentRoom)
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
    
    if (currentRoom && currentRoom.phase === 'lobby') {
      currentRoom.players = currentRoom.players.filter(p => p.id !== socket.id)
      if (currentRoom.players.length === 0) {
        rooms.delete(currentRoom.code)
      } else {
        sendMessage(currentRoom, 'info', '一名玩家离开了')
        broadcastRoomState(currentRoom)
      }
    }
  })
})

const PORT = process.env.PORT || 8080
httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})
