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
}

export interface Cell {
  id: number
  type: 'empty' | 'chance' | 'destiny' | 'diamond' | 'start' | 'bank' | 'stock' | 'futures'
  name: string
  price?: number
  owner?: string
  level: number
  basePrice: number
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
}

export interface FuturesContract {
  symbol: string
  name: string
  price: number
  change: number
  unit: number
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
