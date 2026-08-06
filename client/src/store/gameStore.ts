import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'

// Types
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
  isCurrentTurn: boolean
}

export interface StockHolding {
  symbol: string
  quantity: number
  avgCost: number
  shortQuantity?: number
}

export interface Cell {
  id: number
  type: 'empty' | 'chance' | 'destiny' | 'diamond' | 'start' | 'bank' | 'stock'
  name: string
  price?: number
  owner?: string
  level: number
  basePrice: number
}

export interface Stock {
  symbol: string
  name: string
  price: number
  change: number
  trend?: 'up' | 'down'
  trendDays?: number
}

export interface GameState {
  roomCode: string
  players: Player[]
  cells: Cell[]
  stocks: Stock[]
  currentPlayerIndex: number
  currentTurn: number
  gamePhase: 'lobby' | 'playing' | 'ended'
  selectedCell: number | null
  diceValue: number | null
  forcedDice: number | null
  messages: GameMessage[]
}

export interface GameMessage {
  id: string
  type: 'info' | 'warning' | 'success' | 'error'
  content: string
  timestamp: number
}

// Store
interface GameStore extends GameState {
  socket: Socket | null
  myPlayerId: string | null
  
  // Actions
  setSocket: (socket: Socket | null) => void
  setMyPlayerId: (id: string | null) => void
  updateGameState: (state: Partial<GameState>) => void
  addMessage: (type: GameMessage['type'], content: string) => void
  reset: () => void
}

const initialState: GameState = {
  roomCode: '',
  players: [],
  cells: [],
  stocks: [],
  currentPlayerIndex: 0,
  currentTurn: 1,
  gamePhase: 'lobby',
  selectedCell: null,
  diceValue: null,
  forcedDice: null,
  messages: []
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,
  socket: null,
  myPlayerId: null,

  setSocket: (socket) => set({ socket }),
  setMyPlayerId: (id) => set({ myPlayerId: id }),

  updateGameState: (state) => set(state),

  addMessage: (type, content) => {
    const message: GameMessage = {
      id: crypto.randomUUID(),
      type,
      content,
      timestamp: Date.now()
    }
    set((state) => ({
      messages: [...state.messages.slice(-49), message]
    }))
  },

  reset: () => set(initialState)
}))
