import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

export default function Dice() {
  const { diceValue, isRolling } = useGameStore()
  const [animation, setAnimation] = useState(false)

  if (diceValue === null) return null

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
      <div className={`
        w-20 h-20 bg-white rounded-xl flex items-center justify-center
        text-4xl font-bold text-primary shadow-2xl
        ${animation ? 'animate-bounce' : ''}
      `}>
        {diceValue}
      </div>
    </div>
  )
}
