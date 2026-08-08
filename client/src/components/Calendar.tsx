import { useMemo } from 'react'

interface CalendarProps {
  date: string
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

export default function Calendar({ date }: CalendarProps) {
  const calendar = useMemo(() => {
    const current = new Date(`${date || '2026-01-01'}T00:00:00Z`)
    const year = current.getUTCFullYear()
    const month = current.getUTCMonth()
    const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay()
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const cells: (number | null)[] = Array(firstDay).fill(null)
    for (let day = 1; day <= daysInMonth; day++) cells.push(day)
    while (cells.length % 7 !== 0) cells.push(null)
    return { year, month, cells }
  }, [date])

  const currentDay = Number.parseInt((date || '').slice(-2), 10)

  return (
    <div className="bg-secondary rounded-xl px-3 py-2 min-w-[205px] shadow-lg border border-gray-700">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400">📅 游戏日历</span>
        <span className="text-sm font-bold text-gold">{formatDate(date)}</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px]">
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <span key={day} className="text-gray-500 font-bold">{day}</span>
        ))}
        {calendar.cells.map((day, index) => (
          <span
            key={`${calendar.year}-${calendar.month}-${index}`}
            className={`rounded py-0.5 ${day === currentDay ? 'bg-accent text-white font-bold' : day ? 'text-gray-300' : ''}`}
          >
            {day || ''}
          </span>
        ))}
      </div>
    </div>
  )
}
