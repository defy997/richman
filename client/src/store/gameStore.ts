import { create } from 'zustand'

// Types
export interface Loan {
  id: string
  amount: number
  interestRate: number
  turnsRemaining: number
  createdAt: number
}

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
  type: 'empty' | 'chance' | 'destiny' | 'diamond' | 'start' | 'bank' | 'stock' | 'futures'
  name: string
  price?: number
  owner?: string | null
  level: number
  basePrice: number
  visitCount?: number
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
}

export interface FuturesContract {
  symbol: string
  name: string
  price: number
  change: number
  unit: number
  // 高级模拟字段
  base: number
  history: KLine[]
  volumes: number[]
  eventEffect: number
  eventDays: number
  eventDesc: string
  consolidateDays: number
  isConsolidating: boolean
  isNoManipulator: boolean
  noManipulatorDays: number
  open: number
  high: number
  low: number
  kline?: number[]
  ma5?: (number | null)[]
  ma10?: (number | null)[]
  ma20?: (number | null)[]
  news?: string
  type: 'gold' | 'silver' | 'diamond'
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

  setSocket: (socket: any) => void
  setMyPlayerId: (id: string | null) => void
  updateGameState: (state: Partial<GameState>) => void
  addMessage: (type: GameMessage['type'], content: string) => void
  reset: () => void
}

const initialState: GameState = {
  roomCode: '',
  mode: 'multiplayer',
  targetAssets: 0,
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

  reset: () => set({ ...initialState, socket: null, myPlayerId: null })
}))
