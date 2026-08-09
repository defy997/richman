import { create } from 'zustand'

// Types
export interface Loan {
  id: string
  amount: number
  interestRate: number
  turnsRemaining: number
  createdAt: number
}

// 建材库存
export interface Materials {
  cement: number
  steel: number
  rubber: number
  preciousMetals: number
  diamonds: number
}

// 地皮特殊升级类型
export type PropertyUpgrade = 'normal' | 'hotel' | 'smelter' | 'diamondMine' | 'agency' | 'resort' | 'mall' | 'monument'

export interface Player {
  id: string
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
  futuresHoldings?: FuturesHolding[]
  loans: Loan[]
  passedBank: boolean
  isCurrentTurn: boolean
  isAI?: boolean
  aiDifficulty?: 'easy' | 'normal' | 'hard'
  totalAssets?: number
  // 建材库存
  materials: Materials
  // 同花顺软件
  hasTonghuashun: boolean
  // 是否在股票交易所
  atStockExchange: boolean
  // 是否在期货交易所
  atFuturesExchange: boolean
  // 吸引力：地标经济核心资源（来源于地标建筑、期货交易所等）
  attraction: number
}

export interface StockHolding {
  symbol: string
  quantity: number
  avgCost: number
  shortQuantity?: number
  shortAvgCost?: number
  shortMarginFrozen?: number
  shortCashReceived?: number
}

export interface Cell {
  id: number
  type: 'empty' | 'chance' | 'destiny' | 'diamond' | 'start' | 'bank' | 'stock' | 'futures' | 'realestate'
  name: string
  price?: number
  owner?: string | null
  level: number
  basePrice: number
  visitCount?: number
  upgrade?: PropertyUpgrade
  // 拍卖地皮标记：永久免过路费；升级费用/建材减半；可直接升级无次数限制
  fromAuction?: boolean
  // 拍卖相关字段
  auctionActive?: boolean
  auctionReservedPrice?: number
  auctionHighestBid?: number
  auctionHighestBidder?: string | null
  // 增值系数：每次收过路费 +2%，封顶 200%
  appreciation?: number
}

export interface KLine {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Stock {
  symbol: string
  name: string
  sector: string
  price: number
  change: number
  trend?: 'up' | 'down'
  trendDays?: number
  // 红心/黑心卡效果：-1 ~ +1，0 = 无效果
  cardBias?: number
  cardBiasDays?: number
  cardBiasLastUsedTurn?: number
  cardBiasShield?: boolean
  news?: string
  limitUp?: boolean
  limitDown?: boolean
  kline?: number[]
  // 高级模拟
  history: KLine[]
  base: number
  eventEffect: number
  eventDays: number
  eventDesc: string
  consolidateDays: number
  isConsolidating: boolean
  isNoManipulator: boolean
  noManipulatorDays: number
  volumes: number[]
  open: number
  high: number
  low: number
  // 技术指标
  ma5?: (number | null)[]
  ma10?: (number | null)[]
  ma20?: (number | null)[]
  rsi?: (number | null)[]
  macd?: number[]
  dif?: number[]
  dea?: number[]
}

export interface FuturesHolding {
  symbol: string
  longQuantity: number
  longAvgCost: number
  shortQuantity: number
  shortAvgCost: number
  shortInitialMargin: number
  shortMaintenanceMargin: number
  longLeverage: number
  shortLeverage: number
  longFrozenCost: number
  longOpenedOnDay: number
  shortOpenedOnDay: number
}

export interface FuturesContract {
  symbol: string
  name: string
  price: number
  change: number
  unit: number
  // 高级模拟字段
  base: number
  volatility: number
  history: KLine[]
  volumes: number[]
  eventEffect: number
  eventDays: number
  eventDesc: string
  consolidateDays: number
  isConsolidating: boolean
  isNoManipulator: boolean
  noManipulatorDays: number
  // 红心/黑心卡效果
  cardBias?: number
  cardBiasDays?: number
  cardBiasLastUsedTurn?: number
  cardBiasShield?: boolean
  open: number
  high: number
  low: number
  kline?: number[]
  ma5?: (number | null)[]
  ma10?: (number | null)[]
  ma20?: (number | null)[]
  news?: string
  type: 'gold' | 'silver' | 'diamond' | 'cement' | 'steel' | 'rubber' | 'oil' | 'wheat'
  category: 'precious' | 'material' | 'energy' | 'agriculture'
  isMaterial: boolean
  limitThreshold: number
  limitUp: boolean
  limitDown: boolean
  expiresInDays: number
  expiresOnDay: number
}

export interface GameMessage {
  id: string
  type: 'info' | 'warning' | 'success' | 'error'
  content: string
  timestamp: number
}

export type GameMode = 'multiplayer' | 'singleplayer'

export interface GameState {
  roomCode: string
  mode: GameMode
  targetAssets: number
  maxPlayers: number
  winnerId: string | null
  players: Player[]
  cells: Cell[]
  stocks: Stock[]
  futures: FuturesContract[]
  gameDate: string
  currentPlayerIndex: number
  currentTurn: number
  gamePhase: 'lobby' | 'playing' | 'ended'
  selectedCell: number | null
  diceValue: number | null
  forcedDice: number | null
  messages: GameMessage[]
}

interface GameStore extends GameState {
  socket: any
  myPlayerId: string | null
  rumorReport: RumorReport | null

  setSocket: (socket: any) => void
  setMyPlayerId: (id: string | null) => void
  updateGameState: (state: Partial<GameState>) => void
  addMessage: (type: GameMessage['type'], content: string) => void
  setRumorReport: (report: RumorReport | null) => void
  reset: () => void
}

const initialState: GameState = {
  roomCode: '',
  mode: 'multiplayer',
  targetAssets: 0,
  maxPlayers: 6,
  winnerId: null,
  players: [],
  cells: [],
  stocks: [],
  futures: [],
  gameDate: '',
  currentPlayerIndex: 0,
  currentTurn: 1,
  gamePhase: 'lobby',
  selectedCell: null,
  diceValue: null,
  forcedDice: null,
  messages: []
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,
  socket: null,
  myPlayerId: null,
  rumorReport: null,

  setSocket: (socket) => set({ socket }),
  setMyPlayerId: (id) => set({ myPlayerId: id }),

  updateGameState: (state) => set((prev) => ({ ...prev, ...state })),

  addMessage: (type, content) => {
    const message: GameMessage = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      type,
      content,
      timestamp: Date.now()
    }
    set((state) => ({
      messages: [...state.messages.slice(-49), message]
    }))
  },

  setRumorReport: (report) => set({ rumorReport: report }),

  reset: () => set({ ...initialState, socket: null, myPlayerId: null, rumorReport: null })
}))

// 谣言卡报告数据：玩家散布的利好/利空消息详情
export interface RumorReport {
  targetSymbol: string
  targetName: string
  targetType: '股票' | '期货'
  direction: 'good' | 'bad'
  eventDays: number
  newsContent: string
  hint: string
}
