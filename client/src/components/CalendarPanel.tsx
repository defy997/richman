import { useMemo, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { createPortal } from 'react-dom'

export default function CalendarPanel() {
  const { players, currentTurn, messages, stocks } = useGameStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<number>(0) // 0=当前

  // 起始日期（房间创建时 = 今天的日期）
  const startDate = useMemo(() => {
    const stored = sessionStorage.getItem('roomStartDate')
    if (stored) return new Date(stored)
    const now = new Date()
    sessionStorage.setItem('roomStartDate', now.toISOString())
    return now
  }, [])

  // 当前日期
  const currentDate = useMemo(() => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + currentTurn - 1)
    return d
  }, [startDate, currentTurn])

  // 关闭后清session
  const closeAndReset = () => {
    setIsOpen(false)
  }

  // 玩家当前位置
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex)
  const currentPlayer = players[currentPlayerIndex]

  // 日历：显示当前月份，前2月+当前+后2月
  const calendarMonths = useMemo(() => {
    const months: { date: Date; label: string }[] = []
    for (let i = -2; i <= 3; i++) {
      const d = new Date(currentDate)
      d.setMonth(d.getDate() === 1 ? d.getMonth() + i : d.getMonth() + i)
      d.setDate(1)
      months.push({
        date: d,
        label: `${d.getFullYear()}年${d.getMonth() + 1}月`
      })
    }
    return months
  }, [currentDate])

  const renderMonth = (monthDate: Date) => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startWeekDay = firstDay.getDay() // 0=日
    const daysInMonth = lastDay.getDate()

    const days = []
    for (let i = 0; i < startWeekDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const diffDays = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      const isCurrentDate = year === currentDate.getFullYear() && month === currentDate.getMonth() && d === currentDate.getDate()
      const isPast = diffDays < 0
      const isFuture = diffDays > 0
      days.push({ d, diffDays, isCurrentDate, isPast, isFuture })
    }

    return (
      <div key={`${year}-${month}`} className="bg-primary rounded-lg p-2 mb-2">
        <div className="text-center font-bold text-sm mb-1 text-gold">{`${year}年${month + 1}月`}</div>
        <div className="grid grid-cols-7 gap-0.5 text-[10px] text-center text-gray-500 mb-1">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day, idx) => {
            if (!day) return <div key={idx} className="aspect-square" />
            const baseColor = day.isCurrentDate ? 'bg-accent text-white' : day.isPast ? 'bg-gray-700/30 text-gray-500' : day.isFuture ? 'bg-gray-800/50 text-gray-400' : 'bg-gray-700 text-gray-300'
            return (
              <div
                key={idx}
                className={`aspect-square rounded text-[10px] flex items-center justify-center cursor-pointer hover:ring-1 hover:ring-yellow-400 ${baseColor}`}
                title={day.isCurrentDate ? '今天' : `${day.diffDays + 1} 回合`}
              >
                {day.d}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 卡片总数
  const totalCards = useMemo(() => {
    return players.reduce((sum, p) => sum + (p.cards?.length || 0), 0)
  }, [players])

  // 玩家资产排行
  const ranking = useMemo(() => {
    return [...players].sort((a, b) => (b.totalAssets || 0) - (a.totalAssets || 0))
  }, [players])

  return (
    <>
      <div className="p-3">
        <div
          className="bg-primary rounded-lg p-2 cursor-pointer hover:bg-primary/80 transition-colors"
          onClick={(e) => { e.stopPropagation(); setIsOpen(true) }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📅</span>
              <span className="text-sm font-bold">日历</span>
            </div>
            <span className="text-xs text-gray-400">R{currentTurn}</span>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {currentDate.getMonth() + 1}月{currentDate.getDate()}日
          </div>
        </div>
      </div>

      {isOpen && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={closeAndReset}
        >
          <div
            style={{ width: '900px', height: '700px', maxWidth: '95vw', maxHeight: '92vh' }}
            className="bg-secondary rounded-xl shadow-2xl overflow-hidden flex"
            onClick={e => e.stopPropagation()}
          >
            {/* 左侧：日历 */}
            <div className="flex-1 p-4 overflow-y-auto min-w-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold">📅 游戏日历</h2>
                <button onClick={closeAndReset} className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center text-lg">×</button>
              </div>

              <div className="bg-primary rounded-lg p-3 mb-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-xs text-gray-400">当前回合</div>
                    <div className="text-2xl font-bold text-gold">R{currentTurn}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">游戏日期</div>
                    <div className="text-lg font-bold text-blue-400">{currentDate.getFullYear()}年{currentDate.getMonth() + 1}月{currentDate.getDate()}日</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">当前玩家</div>
                    <div className="text-lg font-bold text-cyan-400">{currentPlayer?.name || '-'}</div>
                  </div>
                </div>
              </div>

              {calendarMonths.map(m => renderMonth(m.date))}
            </div>

            {/* 右侧：统计 + 排行 */}
            <div className="w-72 bg-primary/30 border-l border-gray-700 p-3 overflow-y-auto flex-shrink-0">
              <h3 className="text-sm font-bold mb-2">📊 游戏统计</h3>

              <div className="bg-primary rounded-lg p-2 mb-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">玩家数</span>
                  <span className="font-bold">{players.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">股票数</span>
                  <span className="font-bold">{stocks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">卡片总数</span>
                  <span className="font-bold text-yellow-400">{totalCards} 张</span>
                </div>
              </div>

              <h3 className="text-sm font-bold mb-2">🏆 资产排行</h3>
              <div className="space-y-1 mb-3">
                {ranking.slice(0, 5).map((p, idx) => (
                  <div key={p.id} className={`bg-primary rounded p-2 flex items-center gap-2 ${idx === 0 ? 'border-2 border-gold' : ''}`}>
                    <div className="w-5 text-center font-bold text-sm">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                    </div>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <div className="flex-1 text-xs truncate">{p.name}</div>
                    <div className="text-xs font-bold text-gold">${(p.totalAssets || 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>

              <h3 className="text-sm font-bold mb-2">📅 重要事件</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {messages.slice().reverse().slice(0, 20).map((m, i) => (
                  <div key={i} className={`text-[10px] px-2 py-1 rounded ${m.type === 'success' ? 'bg-green-900/30 text-green-300' : m.type === 'warning' ? 'bg-yellow-900/30 text-yellow-300' : m.type === 'error' ? 'bg-red-900/30 text-red-300' : 'bg-gray-700/50 text-gray-300'}`}>
                    {m.content}
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="text-xs text-gray-500 text-center py-2">暂无事件</div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}