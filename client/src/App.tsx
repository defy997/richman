import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { io, Socket } from 'socket.io-client'
import Lobby from './components/Lobby'
import GameBoard from './components/GameBoard'
import './App.css'

function App() {
  const { gamePhase, socket, setSocket, setMyPlayerId, updateGameState, addMessage, setRumorReport } = useGameStore()

  useEffect(() => {
    const newSocket: Socket = io()
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

    // 关键：监听房间创建/加入事件来设置 myPlayerId
    newSocket.on('roomCreated', ({ playerId }: { roomCode: string; playerId: string }) => {
      console.log('roomCreated, playerId:', playerId)
      setMyPlayerId(playerId)
    })

    newSocket.on('roomJoined', ({ playerId }: { roomCode: string; playerId: string }) => {
      console.log('roomJoined, playerId:', playerId)
      setMyPlayerId(playerId)
    })

    // 谣言卡报告：仅推送给当前玩家本人
    newSocket.on('rumorReport', (report: any) => {
      setRumorReport(report)
    })

    return () => {
      newSocket.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="app">
      {gamePhase === 'lobby' ? <Lobby /> : <GameBoard />}
    </div>
  )
}

export default App