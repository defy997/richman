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

// ============ Types ============
interface StockHolding {
  symbol: string
  quantity: number
  avgCost: number
  shortQuantity: number
  shortAvgCost: number
}

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
  // 贷款
  loans: Loan[]
  // 是否经过银行（用于银行操作限制）
  passedBank: boolean
  // 站立回合数
  stayTurns: number
  isAI: boolean
  aiDifficulty?: 'easy' | 'normal' | 'hard'
}

interface Loan {
  id: string
  amount: number
  interestRate: number
  turnsRemaining: number // 剩余回合数
  createdAt: number
}

interface Cell {
  id: number
  type: 'empty' | 'chance' | 'destiny' | 'diamond' | 'start' | 'bank' | 'stock' | 'futures'
  name: string
  price: number
  owner: string | null
  level: number
  basePrice: number
}

interface Stock {
  symbol: string
  name: string
  sector: string
  price: number
  change: number
  trend: 'up' | 'down' | null
  trendDays: number
  news?: string // 利好/利空消息
  limitUp?: boolean
  limitDown?: boolean
  kline?: number[]
}

interface FuturesContract {
  symbol: string    // 符号
  name: string      // 名称（石油/黄金/小麦等）
  price: number     // 当前价格
  change: number   // 涨跌幅
  unit: number      // 每手数量
}

interface GameRoom {
  code: string
  mode: 'multiplayer' | 'singleplayer'
  players: Player[]
  cells: Cell[]
  stocks: Stock[]
  futures: FuturesContract[]
  currentPlayerIndex: number
  currentTurn: number
  phase: 'lobby' | 'playing' | 'ended'
  diceValue: number | null
  forcedDice: number | null
  stayCurrentTurn: boolean
  targetAssets: number
  winnerId: string | null
  turnStartedAt: number
}

// ============ Constants ============
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22']
const INITIAL_CASH = 50000
const INITIAL_DEPOSIT = 50000
const INITIAL_DIAMONDS = 100
const START_BONUS = 1000
const SINGLEPLAYER_TARGET = 1_000_000

// 贷款利率和期限
const LOAN_INTEREST_RATE = 0.1  // 每3回合10%利息
const LOAN_TURNS_UNTIL_DUE = 5  // 5回合后到期
const LOAN_FEE_RATE = 0.02      // 2% 手续费
const BANK_FEE_RATE = 0.01       // 1% 存款/取现手续费

const TOTAL_CELLS = 60

// ============ Game State ============
const rooms = new Map<string, GameRoom>()

const STOCK_NAMES = [
  { name: '科技', sector: 'TMT', stocks: ['腾讯控股', '阿里巴巴', '百度集团', '美团'] },
  { name: '金融', sector: '金融', stocks: ['中国平安', '招商银行', '中国太保', '中信证券'] },
  { name: '能源', sector: '能源', stocks: ['中国石油', '中国石化', '中国神华', '长江电力'] },
  { name: '医疗', sector: '消费', stocks: ['恒瑞医药', '迈瑞医疗', '药明康德', '爱尔眼科'] },
  { name: '消费', sector: '消费', stocks: ['贵州茅台', '五粮液', '美的集团', '比亚迪'] },
  { name: '工业', sector: '周期', stocks: ['中国中车', '三一重工', '宝钢股份', '海螺水泥'] },
  { name: '地产', sector: '周期', stocks: ['万科A', '保利发展', '中国建筑', '中国中铁'] },
  { name: '农业', sector: '农业', stocks: ['隆平高科', '登海种业', '北大荒', '新希望'] },
  { name: '军工', sector: '防务', stocks: ['中国船舶', '中航沈飞', '航发动力', '中航光电'] },
  { name: '教育', sector: 'TMT', stocks: ['新东方', '好未来', '中公教育', '学而思'] },
  { name: '娱乐', sector: '消费', stocks: ['哔哩哔哩', '网易', '万达电影', '宋城演艺'] },
  { name: '交通', sector: '基建', stocks: ['中国国航', '南方航空', '中远海控', '京沪高铁'] },
  { name: '物流', sector: '基建', stocks: ['顺丰控股', '京东物流', '圆通速递', '中通快递'] },
  { name: '材料', sector: '周期', stocks: ['紫金矿业', '洛阳钼业', '赣锋锂业', '天齐锂业'] },
  { name: '环保', sector: '基建', stocks: ['碧水源', '伟明环保', '瀚蓝环境', '上海环境'] }
]

const FUTURES_NAMES = [
  '石油', '黄金', '白银', '小麦', '玉米', '大豆', '铜', '铝',
  '天然气', '咖啡', '棉花', '糖'
]

const STOCK_NEWS = {
  good: [
    '📰 公司业绩大幅增长，季度利润超预期',
    '📰 获得重大政府合同，市场份额扩大',
    '📰 成功研发新技术，产品供不应求',
    '📰 行业景气度上升，订单量激增',
    '📰 并购重组完成，估值大幅提升',
    '📰 出口业务增长，汇率收益可观',
    '📰 获得国际认证，打开全球市场',
    '📰 降本增效显著，利润率提升'
  ],
  bad: [
    '📰 遭遇反垄断调查，股价承压',
    '📰 产品质量问题，召回产品损失惨重',
    '📰 行业产能过剩，竞争加剧',
    '📰 原材料价格上涨，成本压力增大',
    '📰 高管变动频繁，投资者担忧',
    '📰 环保违规被处罚，整改成本高',
    '📰 海外市场遇阻，出口下滑',
    '📰 库存积压，资金周转困难'
  ]
}

const AI_NAMES_EASY = ['小李', '阿强', '小王']
const AI_NAMES_NORMAL = ['陈总', 'Lisa', 'Mark']
const AI_NAMES_HARD = ['金融大鳄', '巴菲特', '索罗斯']

// ============ Generate 60-cell square board ============
// 方形布局：顶排(0-14) → 右列(15-29) → 底排(30-44) → 左列(45-59)
// 起点在左上角(0)，顺时针
function generateCells(): Cell[] {
  // 特殊格位置（60格方形）
  // 起点: 0
  // 银行: 5 (顶排中部)
  // 股票交易所: 25 (右列中部)
  // 期货交易所: 45 (左列中部)
  // 钻石: 10, 20, 35, 50
  // 机会: 3, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57
  // 命运: 15, 30, 40, 55

  const special: Record<number, Cell['type']> = {}
  const cellTypes: Cell['type'][] = []

  for (let i = 0; i < TOTAL_CELLS; i++) {
    let type: Cell['type'] = 'empty'
    if (i === 0) type = 'start'
    else if (i === 5) type = 'bank'
    else if (i === 25) type = 'stock'
    else if (i === 45) type = 'futures'
    else if ([10, 20, 35, 50].includes(i)) type = 'diamond'
    else if ([3, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57].includes(i)) type = 'chance'
    else if ([15, 30, 40, 55].includes(i)) type = 'destiny'
    cellTypes.push(type)
  }

  return cellTypes.map((type, i) => {
    let name = ''
    let basePrice = 0
    let price = 0

    switch (type) {
      case 'start':
        name = '🚩起点'
        break
      case 'bank':
        name = '🏦平安银行'
        break
      case 'stock':
        name = '📈股票交易所'
        break
      case 'futures':
        name = '🛢️期货交易所'
        break
      case 'chance':
        name = '❓机会'
        break
      case 'destiny':
        name = '🎯命运'
        break
      case 'diamond':
        name = '💎钻石'
        break
      case 'empty': {
        const regionNames = [
          '朝阳', '海淀', '丰台', '石景山', '西城', '东城', '崇文', '宣武', '昌平', '大兴',
          '通州', '顺义', '怀柔', '密云', '平谷', '延庆', '门头沟', '房山', '燕山', '黄村',
          '滨海', '河东', '河西', '南开', '河北', '红桥', '东丽', '西青', '津南', '北辰',
          '武清', '静海', '宝坻', '宁河', '蓟县', '长安', '桥西', '新华', '裕华', '井陉',
          '浦东', '黄浦', '徐汇', '长宁', '静安', '普陀', '虹口', '杨浦', '闵行', '宝山',
          '嘉定', '金山', '松江', '青浦', '奉贤', '崇明', '西湖', '滨江', '上城', '下城'
        ]
        name = regionNames[i] || `地块${i}`
        // 价位：顶排和右列较贵
        if (i >= 30 && i <= 44) basePrice = Math.floor(Math.random() * 800) + 600
        else if (i >= 45 && i <= 59) basePrice = Math.floor(Math.random() * 1000) + 700
        else basePrice = Math.floor(Math.random() * 1500) + 1000
        price = basePrice
        break
      }
    }

    return { id: i, type, name, price, owner: null, level: 0, basePrice }
  })
}

function generateStocks(): Stock[] {
  const stocks: Stock[] = []
  STOCK_NAMES.forEach((sector, si) => {
    sector.stocks.forEach((name, i) => {
      stocks.push({
        symbol: `STK${String(si * 4 + i + 1).padStart(2, '0')}`,
        name,
        sector: sector.sector,
        price: Math.floor(Math.random() * 900) + 100,
        change: 0,
        trend: null,
        trendDays: 0,
        news: undefined,
        limitUp: false,
        limitDown: false,
        kline: Array.from({ length: 20 }, () => Math.floor(Math.random() * 900) + 100)
      })
    })
  })
  return stocks
}

function generateFutures(): FuturesContract[] {
  return FUTURES_NAMES.map((name, i) => ({
    symbol: `FT${String(i + 1).padStart(2, '0')}`,
    name,
    price: Math.floor(Math.random() * 800) + 50,
    change: 0,
    unit: 10
  }))
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function calculateAssets(player: Player, room: GameRoom): number {
  let total = player.cash + player.deposit
  // 房产估值
  total += player.properties.reduce((sum, cellId) => {
    const cell = room.cells[cellId]
    return sum + (cell?.basePrice || 0)
  }, 0)
  // 股票市值
  total += player.stocks.reduce((sum, holding) => {
    const stock = room.stocks.find(s => s.symbol === holding.symbol)
    if (!stock) return sum
    return sum + stock.price * (holding.quantity - holding.shortQuantity)
  }, 0)
  // 钻石估值
  total += player.diamonds * 100
  // 减去未还贷款
  total -= player.loans.reduce((sum, loan) => sum + loan.amount + Math.floor(loan.amount * loan.interestRate), 0)
  return Math.max(0, total)
}

function broadcastRoomState(room: GameRoom) {
  const state = {
    roomCode: room.code,
    mode: room.mode,
    targetAssets: room.targetAssets,
    winnerId: room.winnerId,
    currentTurn: room.currentTurn,
    players: room.players.map(p => ({
      ...p,
      socketId: undefined,
      totalAssets: calculateAssets(p, room),
      isCurrentTurn: room.players.indexOf(p) === room.currentPlayerIndex,
      loans: p.loans.map(l => ({ ...l }))
    })),
    cells: room.cells,
    stocks: room.stocks,
    futures: room.futures,
    currentPlayerIndex: room.currentPlayerIndex,
    gamePhase: room.phase,
    diceValue: room.diceValue,
    forcedDice: room.forcedDice
  }
  io.to(room.code).emit('gameState', state)
}

function sendMessage(room: GameRoom, type: 'info' | 'warning' | 'success' | 'error', content: string) {
  io.to(room.code).emit('message', { type, content })
}

// ============ Loan System ============
function getMaxLoan(player: Player): number {
  if (player.properties.length === 0) return 0
  const maxLevel = player.properties.reduce((max, id) => {
    const cell = player.properties.find(() => true) // 找最高等级
    return max
  }, 0)
  // 基于存款计算
  const multipliers: Record<number, number> = { 0: 0, 1: 0.5, 2: 1.0, 3: 1.5, 4: 2.0 }
  const highestLevel = player.properties.reduce((max, propId) => {
    return Math.max(max, player.properties.length) // 简化：按房产数量
  }, 0)
  const multiplier = multipliers[Math.min(highestLevel, 4)] || 0.3
  return Math.floor(player.deposit * multiplier)
}

function getTotalDebt(player: Player): number {
  return player.loans.reduce((sum, loan) => sum + loan.amount + Math.floor(loan.amount * loan.interestRate), 0)
}

// ============ Stock News System ============
function generateStockNews(room: GameRoom) {
  // 随机给1-2支股票添加消息
  const count = Math.random() < 0.3 ? 2 : 1
  const indices = [...Array(room.stocks.length).keys()].sort(() => Math.random() - 0.5).slice(0, count)

  indices.forEach(idx => {
    const isGood = Math.random() > 0.5
    const news = isGood
      ? STOCK_NEWS.good[Math.floor(Math.random() * STOCK_NEWS.good.length)]
      : STOCK_NEWS.bad[Math.floor(Math.random() * STOCK_NEWS.bad.length)]
    room.stocks[idx].news = news
    sendMessage(room, 'info', `${room.stocks[idx].name}(${room.stocks[idx].symbol}): ${news}`)
  })
}

// ============ Update Stock Prices ============
function updateStockPrices(room: GameRoom) {
  const LIMIT_THRESHOLD = 10 // 涨跌停阈值 10%

  room.stocks.forEach(stock => {
    // 清除旧消息
    stock.news = undefined
    stock.limitUp = false
    stock.limitDown = false

    if (stock.trendDays > 0) {
      stock.trendDays--
      if (stock.trendDays === 0) {
        stock.trend = null
      }
    }

    let changePercent: number
    if (stock.trend === 'up') {
      changePercent = Math.random() * 8 + 3
    } else if (stock.trend === 'down') {
      changePercent = -(Math.random() * 8 + 3)
    } else {
      changePercent = (Math.random() - 0.4) * 25
    }

    // 涨跌停检测
    if (stock.change >= LIMIT_THRESHOLD) {
      stock.limitUp = true
      changePercent = 0 // 涨停当天不波动
    } else if (stock.change <= -LIMIT_THRESHOLD) {
      stock.limitDown = true
      changePercent = 0 // 跌停当天不波动
    }

    const oldPrice = stock.price
    stock.price = Math.max(10, Math.round(stock.price * (1 + changePercent / 100)))
    stock.change = ((stock.price - oldPrice) / oldPrice) * 100

    // 更新K线数据
    if (!stock.kline) stock.kline = []
    stock.kline.push(stock.price)
    if (stock.kline.length > 30) stock.kline.shift()

    // 处理做空结算
    room.players.forEach(player => {
      const holding = player.stocks.find(s => s.symbol === stock.symbol)
      if (holding && holding.shortQuantity > 0) {
        const shortProfit = (oldPrice - stock.price) * holding.shortQuantity
        player.cash += shortProfit
        if (shortProfit > 0) {
          sendMessage(room, 'success', `${player.name} 做空 ${stock.symbol} 获利 $${Math.round(shortProfit)}`)
        } else if (shortProfit < 0) {
          sendMessage(room, 'warning', `${player.name} 做空 ${stock.symbol} 亏损 $${Math.round(-shortProfit)}`)
        }
      }
    })
  })

  // 生成股票新闻
  generateStockNews(room)
}

// ============ Update Futures Prices ============
function updateFuturesPrices(room: GameRoom) {
  room.futures.forEach(f => {
    const change = (Math.random() - 0.5) * 15
    const oldPrice = f.price
    f.price = Math.max(10, Math.round(f.price * (1 + change / 100)))
    f.change = ((f.price - oldPrice) / oldPrice) * 100
  })
}

// ============ Process Cell Event ============
function processCellEvent(room: GameRoom, player: Player) {
  const cell = room.cells[player.position]

  // 清除经过银行标记（只有站在银行才有效）
  player.passedBank = false

  switch (cell.type) {
    case 'start':
      player.cash += START_BONUS
      sendMessage(room, 'info', `${player.name} 经过起点，获得 $${START_BONUS}`)
      break

    case 'bank':
      player.passedBank = true
      sendMessage(room, 'info', `${player.name} 来到银行，可以使用存/取款/贷款服务`)
      break

    case 'stock':
      sendMessage(room, 'info', `${player.name} 来到股票交易所，可在下方面板进行股票交易`)
      break

    case 'futures':
      sendMessage(room, 'info', `${player.name} 来到期货交易所，可用存款交易期货赚取钻石`)
      break

    case 'chance': {
      const chanceEvent = Math.random()
      if (chanceEvent < 0.3) {
        player.cash += 500
        sendMessage(room, 'success', `${player.name} 抽到机会卡，获得 $500`)
      } else if (chanceEvent < 0.6) {
        player.cash -= 300
        sendMessage(room, 'warning', `${player.name} 抽到机会卡，损失 $300`)
      } else if (chanceEvent < 0.8) {
        player.diamonds += 1
        sendMessage(room, 'success', `${player.name} 抽到机会卡，获得 1💎`)
      } else {
        const candidates = room.players.filter(p => p.id !== player.id && !p.isBankrupt)
        if (candidates.length > 0) {
          const randomPlayer = candidates[Math.floor(Math.random() * candidates.length)]
          const steal = Math.min(200, randomPlayer.cash)
          if (steal > 0) {
            randomPlayer.cash -= steal
            player.cash += steal
            sendMessage(room, 'info', `${player.name} 抽到机会卡，从 ${randomPlayer.name} 抢走 $${steal}`)
          }
        }
      }
      break
    }

    case 'destiny': {
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
    }

    case 'diamond':
      const diamondReward = Math.floor(Math.random() * 21) + 30 // 30-50
      player.diamonds += diamondReward
      sendMessage(room, 'success', `${player.name} 来到钻石格，获得 ${diamondReward}💎`)
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

  // 检查破产
  if (player.cash + player.deposit < 0) {
    player.isBankrupt = true
    player.properties.forEach(propId => {
      room.cells[propId].owner = null
      room.cells[propId].level = 0
    })
    sendMessage(room, 'error', `${player.name} 破产了!`)
  }
}

// ============ Process Loans (called each turn) ============
function processLoans(room: GameRoom) {
  room.players.forEach(player => {
    if (player.loans.length === 0) return

    // 每回合减少剩余回合
    player.loans.forEach(loan => {
      loan.turnsRemaining--
    })

    // 检查到期贷款
    const dueLoans = player.loans.filter(l => l.turnsRemaining <= 0)
    dueLoans.forEach(loan => {
      const totalDue = loan.amount + Math.floor(loan.amount * loan.interestRate)
      const actualPaid = Math.min(totalDue, player.cash + player.deposit)
      if (actualPaid >= totalDue) {
        // 足额还款
        if (player.cash >= totalDue) {
          player.cash -= totalDue
        } else {
          player.deposit -= (totalDue - player.cash)
          player.cash = 0
        }
        sendMessage(room, 'success', `${player.name} 还清贷款 $${totalDue}（含 ${Math.floor(loan.amount * loan.interestRate)} 利息）`)
      } else {
        // 不足额，破产
        player.isBankrupt = true
        player.properties.forEach(propId => {
          room.cells[propId].owner = null
          room.cells[propId].level = 0
        })
        sendMessage(room, 'error', `${player.name} 贷款到期无法偿还，破产!`)
      }
    })

    // 移除已还清的贷款
    player.loans = player.loans.filter(l => l.turnsRemaining > 0)
  })
}

// ============ Check Win Condition ============
function checkSingleplayerWin(room: GameRoom): boolean {
  if (room.mode !== 'singleplayer') return false
  const currentPlayer = room.players[room.currentPlayerIndex]
  if (!currentPlayer || currentPlayer.isAI) return false
  const assets = calculateAssets(currentPlayer, room)
  if (assets >= room.targetAssets) {
    room.phase = 'ended'
    room.winnerId = currentPlayer.id
    sendMessage(room, 'success', `🎉 恭喜 ${currentPlayer.name}！总资产达到 $${assets.toLocaleString()}，达成百万富翁目标！`)
    sendMessage(room, 'info', `游戏共进行 ${room.currentTurn} 回合`)
    broadcastRoomState(room)
    return true
  }
  return false
}

// ============ Next Player ============
function nextPlayer(room: GameRoom) {
  room.players = room.players.filter(p => !p.isBankrupt)

  if (room.mode === 'multiplayer') {
    if (room.players.length <= 1) {
      room.phase = 'ended'
      const winner = room.players[0]
      if (winner) {
        room.winnerId = winner.id
        sendMessage(room, 'success', `${winner.name} 获得胜利!`)
      }
      broadcastRoomState(room)
      return
    }
  }

  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length
  const currentPlayer = room.players[room.currentPlayerIndex]
  if (currentPlayer?.isBankrupt) {
    nextPlayer(room)
    return
  }

  room.diceValue = null
  room.forcedDice = null
  room.turnStartedAt = Date.now()

  if (currentPlayer?.stayTurns && currentPlayer.stayTurns > 0) {
    currentPlayer.stayTurns--
    room.stayCurrentTurn = true
    sendMessage(room, 'info', `${currentPlayer.name} 被停留卡影响，本回合无法行动`)
  } else {
    room.stayCurrentTurn = false
  }

  if (room.currentPlayerIndex === 0) {
    room.currentTurn++
    processLoans(room)
    updateStockPrices(room)
    updateFuturesPrices(room)
  }

  broadcastRoomState(room)

  if (room.phase === 'playing' && currentPlayer?.isAI) {
    setTimeout(() => aiTurn(room, currentPlayer), 1200)
  }
}

// ============ AI ============
function aiTurn(room: GameRoom, player: Player) {
  if (room.phase !== 'playing') return
  if (room.players[room.currentPlayerIndex]?.id !== player.id) return

  const difficulty = player.aiDifficulty || 'easy'

  let dice = Math.floor(Math.random() * 6) + 1
  if (difficulty === 'hard' && room.forcedDice !== null) {
    dice = room.forcedDice
    room.forcedDice = null
  }
  room.diceValue = dice

  const newPosition = (player.position + dice) % TOTAL_CELLS
  const passedStart = newPosition < player.position
  player.position = newPosition

  sendMessage(room, 'info', `🤖 ${player.name} 投出 ${dice}，移动到 ${room.cells[newPosition].name}`)
  if (passedStart) {
    player.cash += START_BONUS
    sendMessage(room, 'info', `🤖 ${player.name} 经过起点，获得 $${START_BONUS}`)
  }

  processCellEvent(room, player)
  broadcastRoomState(room)

  // 购买地块
  setTimeout(() => {
    if (room.phase !== 'playing') return
    if (room.players[room.currentPlayerIndex]?.id !== player.id) return

    const cell = room.cells[player.position]
    if (cell.type === 'empty' && !cell.owner && player.cash >= cell.price) {
      let buyChance = 0.5
      if (difficulty === 'easy') buyChance = 0.3
      if (difficulty === 'hard') buyChance = 0.8

      if (Math.random() < buyChance) {
        player.cash -= cell.price
        cell.owner = player.id
        player.properties.push(cell.id)
        sendMessage(room, 'success', `🤖 ${player.name} 购买了 ${cell.name}，花费 $${cell.price}`)
        broadcastRoomState(room)
      }
    }

    setTimeout(() => {
      if (room.phase !== 'playing') return
      if (room.players[room.currentPlayerIndex]?.id !== player.id) return

      if (difficulty !== 'easy' && player.properties.length > 0) {
        for (const propId of player.properties) {
          const propCell = room.cells[propId]
          if (propCell.level < 4 && player.cash >= Math.floor(propCell.basePrice * 0.5)) {
            if (Math.random() < 0.4) {
              player.cash -= Math.floor(propCell.basePrice * 0.5)
              propCell.level++
              propCell.price = Math.floor(propCell.basePrice * (1 + propCell.level * 0.5))
              sendMessage(room, 'success', `🤖 ${player.name} 将 ${propCell.name} 升级到 Lv.${propCell.level}`)
              broadcastRoomState(room)
              break
            }
          }
        }
      }

      setTimeout(() => {
        if (room.phase !== 'playing') return
        if (room.players[room.currentPlayerIndex]?.id !== player.id) return
        nextPlayer(room)
      }, 800)
    }, 600)
  }, 800)
}

// ============ Socket Handlers ============
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  let currentRoom: GameRoom | null = null

  socket.on('createRoom', ({ playerName }) => {
    const code = generateRoomCode()
    const room: GameRoom = {
      code,
      mode: 'multiplayer',
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
        loans: [],
        passedBank: false,
        stayTurns: 0,
        isAI: false
      }],
      cells: generateCells(),
      stocks: generateStocks(),
      futures: generateFutures(),
      currentPlayerIndex: 0,
      currentTurn: 1,
      phase: 'lobby',
      diceValue: null,
      forcedDice: null,
      stayCurrentTurn: false,
      targetAssets: 0,
      winnerId: null,
      turnStartedAt: Date.now()
    }

    rooms.set(code, room)
    socket.join(code)
    currentRoom = room

    socket.emit('roomCreated', { roomCode: code, playerId: socket.id })
    broadcastRoomState(room)
  })

  socket.on('createSingleplayer', ({ playerName, aiCount = 3, difficulty = 'normal' }) => {
    const code = generateRoomCode()

    const humanPlayer: Player = {
      id: socket.id,
      socketId: socket.id,
      name: playerName || '玩家',
      color: PLAYER_COLORS[0],
      cash: INITIAL_CASH,
      deposit: INITIAL_DEPOSIT,
      diamonds: INITIAL_DIAMONDS,
      position: 0,
      properties: [],
      isBankrupt: false,
      cards: [],
      stocks: [],
      loans: [],
      passedBank: false,
      stayTurns: 0,
      isAI: false
    }

    const players: Player[] = [humanPlayer]
    const aiPool = difficulty === 'easy' ? AI_NAMES_EASY : difficulty === 'hard' ? AI_NAMES_HARD : AI_NAMES_NORMAL
    for (let i = 0; i < aiCount && i < 5; i++) {
      players.push({
        id: `ai_${code}_${i}`,
        socketId: '',
        name: aiPool[i % aiPool.length],
        color: PLAYER_COLORS[i + 1],
        cash: INITIAL_CASH,
        deposit: INITIAL_DEPOSIT,
        diamonds: INITIAL_DIAMONDS,
        position: 0,
        properties: [],
        isBankrupt: false,
        cards: [],
        stocks: [],
        loans: [],
        passedBank: false,
        stayTurns: 0,
        isAI: true,
        aiDifficulty: difficulty
      })
    }

    const room: GameRoom = {
      code,
      mode: 'singleplayer',
      players,
      cells: generateCells(),
      stocks: generateStocks(),
      futures: generateFutures(),
      currentPlayerIndex: 0,
      currentTurn: 1,
      phase: 'playing',
      diceValue: null,
      forcedDice: null,
      stayCurrentTurn: false,
      targetAssets: SINGLEPLAYER_TARGET,
      winnerId: null,
      turnStartedAt: Date.now()
    }

    rooms.set(code, room)
    socket.join(code)
    currentRoom = room

    socket.emit('roomCreated', { roomCode: code, playerId: socket.id })
    sendMessage(room, 'info', `欢迎来到单人模式！目标：总资产达到 $${SINGLEPLAYER_TARGET.toLocaleString()}`)
    sendMessage(room, 'info', `你将面对 ${aiCount} 个 AI 对手`)
    sendMessage(room, 'success', `游戏开始！${players[0].name} 先手`)
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

    if (room.mode === 'singleplayer') {
      socket.emit('error', { message: '单人模式房间不能加入' })
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
      loans: [],
      passedBank: false,
      stayTurns: 0,
      isAI: false
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
    if (currentRoom.mode === 'singleplayer') return

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
    if (!currentPlayer || currentPlayer.id !== socket.id) {
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

    const newPosition = (currentPlayer.position + diceValue) % TOTAL_CELLS
    const passedStart = newPosition < currentPlayer.position

    currentPlayer.position = newPosition

    sendMessage(currentRoom, 'info', `${currentPlayer.name} 投出 ${diceValue}，移动到 ${currentRoom.cells[newPosition].name}`)

    if (passedStart) {
      currentPlayer.cash += START_BONUS
      sendMessage(currentRoom, 'info', `${currentPlayer.name} 经过起点，获得 $${START_BONUS}`)
    }

    processCellEvent(currentRoom, currentPlayer)
    broadcastRoomState(currentRoom)

    if (currentRoom.mode === 'singleplayer') {
      checkSingleplayerWin(currentRoom)
    }
  })

  socket.on('endTurn', () => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    if (currentRoom.diceValue === null && !currentRoom.stayCurrentTurn) {
      socket.emit('error', { message: '请先投骰子' })
      return
    }

    nextPlayer(currentRoom)
  })

  // ============ 购买地块 ============
  socket.on('buyProperty', ({ cellId }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
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

    if (currentRoom.mode === 'singleplayer') checkSingleplayerWin(currentRoom)
  })

  // ============ 升级地块 ============
  socket.on('upgradeProperty', ({ cellId }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
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

    if (currentRoom.mode === 'singleplayer') checkSingleplayerWin(currentRoom)
  })

  // ============ 银行操作（必须经过银行） ============
  socket.on('bankDeposit', ({ amount }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    if (!currentPlayer.passedBank) {
      socket.emit('error', { message: '只有站在银行地块才能存款' })
      return
    }

    if (amount <= 0) {
      socket.emit('error', { message: '金额必须大于0' })
      return
    }

    if (currentPlayer.cash < amount) {
      socket.emit('error', { message: '现金不足' })
      return
    }

    const fee = Math.floor(amount * BANK_FEE_RATE)
    currentPlayer.cash -= (amount + fee)
    currentPlayer.deposit += amount

    sendMessage(currentRoom, 'info', `${currentPlayer.name} 存款 $${amount}（手续费 $${fee}）`)
    broadcastRoomState(currentRoom)
    if (currentRoom.mode === 'singleplayer') checkSingleplayerWin(currentRoom)
  })

  socket.on('bankWithdraw', ({ amount }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    if (!currentPlayer.passedBank) {
      socket.emit('error', { message: '只有站在银行地块才能取款' })
      return
    }

    if (amount <= 0) {
      socket.emit('error', { message: '金额必须大于0' })
      return
    }

    if (currentPlayer.deposit < amount) {
      socket.emit('error', { message: '存款不足' })
      return
    }

    const fee = Math.floor(amount * BANK_FEE_RATE)
    currentPlayer.deposit -= amount
    currentPlayer.cash += (amount - fee)

    sendMessage(currentRoom, 'info', `${currentPlayer.name} 取款 $${amount}（手续费 $${fee}）`)
    broadcastRoomState(currentRoom)
    if (currentRoom.mode === 'singleplayer') checkSingleplayerWin(currentRoom)
  })

  socket.on('bankConvert', ({ action, amount }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    if (!currentPlayer.passedBank) {
      socket.emit('error', { message: '只有站在银行地块才能使用此功能' })
      return
    }

    if (amount <= 0) {
      socket.emit('error', { message: '金额必须大于0' })
      return
    }

    if (action === 'cashToDeposit') {
      if (currentPlayer.cash < amount) {
        socket.emit('error', { message: '现金不足' })
        return
      }
      const fee = Math.floor(amount * BANK_FEE_RATE)
      currentPlayer.cash -= (amount + fee)
      currentPlayer.deposit += amount
      sendMessage(currentRoom, 'info', `${currentPlayer.name} 将 $${amount} 转为存款（手续费 $${fee}）`)
    } else {
      if (currentPlayer.deposit < amount) {
        socket.emit('error', { message: '存款不足' })
        return
      }
      const fee = Math.floor(amount * BANK_FEE_RATE)
      currentPlayer.deposit -= amount
      currentPlayer.cash += (amount - fee)
      sendMessage(currentRoom, 'info', `${currentPlayer.name} 将 $${amount} 转为现金（手续费 $${fee}）`)
    }

    broadcastRoomState(currentRoom)
    if (currentRoom.mode === 'singleplayer') checkSingleplayerWin(currentRoom)
  })

  // ============ 新贷款系统 ============
  socket.on('takeLoan', ({ amount }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    if (!currentPlayer.passedBank) {
      socket.emit('error', { message: '只有站在银行地块才能贷款' })
      return
    }

    if (currentPlayer.properties.length === 0) {
      socket.emit('error', { message: '至少需要 1 块地皮才能贷款' })
      return
    }

    const maxLoan = getMaxLoan(currentPlayer)
    if (amount <= 0 || amount > maxLoan) {
      socket.emit('error', { message: `可贷额度 $${maxLoan.toLocaleString()}` })
      return
    }

    const loan: Loan = {
      id: `loan_${Date.now()}_${Math.random()}`,
      amount,
      interestRate: LOAN_INTEREST_RATE,
      turnsRemaining: LOAN_TURNS_UNTIL_DUE,
      createdAt: Date.now()
    }

    currentPlayer.loans.push(loan)
    currentPlayer.cash += amount

    sendMessage(currentRoom, 'success', `${currentPlayer.name} 贷款 $${amount}（利息 ${LOAN_INTEREST_RATE * 100}%，${LOAN_TURNS_UNTIL_DUE}回合后到期）`)
    broadcastRoomState(currentRoom)
    if (currentRoom.mode === 'singleplayer') checkSingleplayerWin(currentRoom)
  })

  socket.on('repayLoan', ({ loanId }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    const loanIndex = currentPlayer.loans.findIndex(l => l.id === loanId)
    if (loanIndex === -1) {
      socket.emit('error', { message: '贷款不存在' })
      return
    }

    const loan = currentPlayer.loans[loanIndex]
    const totalDue = loan.amount + Math.floor(loan.amount * loan.interestRate)

    if (currentPlayer.cash < totalDue) {
      socket.emit('error', { message: `现金不足，需 $${totalDue.toLocaleString()}` })
      return
    }

    currentPlayer.cash -= totalDue
    currentPlayer.loans.splice(loanIndex, 1)

    sendMessage(currentRoom, 'success', `${currentPlayer.name} 提前还清贷款 $${totalDue}（本金 $${loan.amount} + 利息 $${Math.floor(loan.amount * loan.interestRate)}）`)
    broadcastRoomState(currentRoom)
    if (currentRoom.mode === 'singleplayer') checkSingleplayerWin(currentRoom)
  })

  // ============ 卡片 ============
  socket.on('buyCard', ({ cardName }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
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
    if (!currentPlayer || currentPlayer.id !== socket.id) {
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

      case '红心卡': {
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
      }

      case '黑心卡': {
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
      }

      case '占地卡': {
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
      }

      case '地皮升级卡': {
        if (currentPlayer.properties.length === 0) {
          socket.emit('error', { message: '你没有地皮' })
          currentPlayer.cards.push(cardName)
          return
        }
        const upgradeableProp = currentPlayer.properties
          .map(id => (currentRoom as GameRoom).cells[id])
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
    }

    broadcastRoomState(currentRoom)
    if (currentRoom.mode === 'singleplayer') checkSingleplayerWin(currentRoom)
  })

  // ============ 股票交易 ============
  socket.on('tradeStock', ({ symbol, action, quantity, leverage }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
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
        // 涨停不能买入
        if (stock.limitUp) {
          socket.emit('error', { message: '该股票涨停，无法买入' })
          return
        }
        const buyCost = stock.price * quantity * leverage
        // 买入用现金
        if (currentPlayer.cash < buyCost) {
          socket.emit('error', { message: '现金不足' })
          return
        }
        const newAvgCost = (holding.avgCost * holding.quantity + stock.price * quantity) / (holding.quantity + quantity)
        holding.avgCost = newAvgCost
        holding.quantity += quantity
        currentPlayer.cash -= buyCost
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 以 $${stock.price} 买入 ${quantity} 股 ${stock.name}`)
        break

      case 'sell':
        // 跌停不能卖出
        if (stock.limitDown) {
          socket.emit('error', { message: '该股票跌停，无法卖出' })
          return
        }
        if (holding.quantity < quantity) {
          socket.emit('error', { message: '持有数量不足' })
          return
        }
        const sellValue = stock.price * quantity
        const profit = (stock.price - holding.avgCost) * quantity
        holding.quantity -= quantity
        currentPlayer.cash += sellValue
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 以 $${stock.price} 卖出 ${quantity} 股 ${stock.name}，${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit))}`)
        if (holding.quantity === 0) {
          holding.avgCost = 0
        }
        break

      case 'short':
        // 做空用存款作为保证金
        const margin = stock.price * quantity / leverage
        if (currentPlayer.deposit < margin) {
          socket.emit('error', { message: '保证金不足（需存款）' })
          return
        }
        holding.shortQuantity += quantity
        holding.shortAvgCost = stock.price
        // 做空获得现金（未来需要买回）
        currentPlayer.cash += stock.price * quantity
        currentPlayer.deposit -= margin
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 做空 ${quantity} 股 ${stock.name}（保证金 $${Math.round(margin)} 从存款扣除）`)
        break

      case 'cover':
        if (holding.shortQuantity < quantity) {
          socket.emit('error', { message: '做空数量不足' })
          return
        }
        const coverCost = stock.price * quantity
        if (currentPlayer.cash < coverCost) {
          socket.emit('error', { message: '现金不足，无法买回平仓' })
          return
        }
        holding.shortQuantity -= quantity
        currentPlayer.cash -= coverCost
        const shortProfit = (holding.shortAvgCost - stock.price) * quantity
        // 归还保证金 + 利润/亏损
        const marginReturn = (stock.price * quantity / leverage) + shortProfit
        currentPlayer.deposit += marginReturn
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 平空 ${quantity} 股 ${stock.name}，${shortProfit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(shortProfit))}`)
        if (holding.shortQuantity === 0) {
          holding.shortAvgCost = 0
        }
        break
    }

    broadcastRoomState(currentRoom)
    if (currentRoom.mode === 'singleplayer') checkSingleplayerWin(currentRoom)
  })

  // ============ 期货交易 ============
  socket.on('tradeFutures', ({ symbol, action, quantity }) => {
    if (!currentRoom) return

    const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '不是你的回合' })
      return
    }

    const futures = currentRoom.futures.find(f => f.symbol === symbol)
    if (!futures) {
      socket.emit('error', { message: '期货不存在' })
      return
    }

    const cost = futures.price * futures.unit * quantity
    const fee = Math.floor(cost * 0.02) // 2% 手续费

    switch (action) {
      case 'buy':
        // 用存款购买
        if (currentPlayer.deposit < cost + fee) {
          socket.emit('error', { message: '存款不足' })
          return
        }
        currentPlayer.deposit -= (cost + fee)
        // 利润直接给钻石
        const profit = Math.floor(cost * (Math.random() * 0.2 - 0.05)) // 简化：随机盈亏 -5% ~ +15%
        const diamonds = Math.max(0, Math.floor((cost + profit) / 500))
        currentPlayer.diamonds += diamonds
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 交易 ${futures.name}期货 x${quantity}，${profit >= 0 ? '获利' : '亏损'} $${Math.abs(profit)}，获得 ${diamonds}💎`)
        break

      case 'sell':
        // 卖出也用存款
        if (currentPlayer.deposit < cost + fee) {
          socket.emit('error', { message: '存款不足' })
          return
        }
        currentPlayer.deposit -= (cost + fee)
        const sellProfit = Math.floor(cost * (Math.random() * 0.2 - 0.05))
        const sellDiamonds = Math.max(0, Math.floor((cost + sellProfit) / 500))
        currentPlayer.diamonds += sellDiamonds
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 交易 ${futures.name}期货 x${quantity}，${sellProfit >= 0 ? '获利' : '亏损'} $${Math.abs(sellProfit)}，获得 ${sellDiamonds}💎`)
        break
    }

    broadcastRoomState(currentRoom)
  })

    // ============ 存款买钻石 ============
    // 已移除（只能通过期货交易或地块获得钻石）

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)

    if (currentRoom && currentRoom.phase === 'lobby' && !currentRoom.players[0]?.isAI) {
      currentRoom.players = currentRoom.players.filter(p => p.id !== socket.id)
      if (currentRoom.players.length === 0 || (currentRoom.players.length === 1 && currentRoom.players[0].isAI)) {
        rooms.delete(currentRoom.code)
      } else {
        sendMessage(currentRoom, 'info', '一名玩家离开了')
        broadcastRoomState(currentRoom)
      }
    } else if (currentRoom && currentRoom.mode === 'singleplayer') {
      sendMessage(currentRoom, 'warning', '玩家已断线，游戏结束')
      currentRoom.phase = 'ended'
      broadcastRoomState(currentRoom)
    }
  })
})

const PORT = process.env.PORT || 3002
httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})
