import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { io, Socket } from 'socket.io-client'
import Lobby from './components/Lobby'
import GameBoard from './components/GameBoard'
import './App.css'

function App() {
  const { gamePhase, socket, setSocket, updateGameState, addMessage } = useGameStore()

  useEffect(() => {
    const newSocket: Socket = io('http://localhost:3001')
    setSocket(newSocket)

    newSocket.on('connect', () => {
      console.log('Connected to server')
      addMessage('info', '已连接到服务器')
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
      addMessage('error', '与服务器断开连接')
    })

    newSocket.on('gameState', (state) => {
      updateGameState(state)
    })

    newSocket.on('error', (error: { message: string }) => {
      addMessage('error', error.message)
    })

    newSocket.on('message', (msg: { type: string; content: string }) => {
      addMessage(msg.type as any, msg.content)
    })

    return () => {
      newSocket.disconnect()
    }
  }, [])

  return (
    <div className="app">
      {gamePhase === 'lobby' ? <Lobby /> : <GameBoard />}
    </div>
  )
}

export default App
