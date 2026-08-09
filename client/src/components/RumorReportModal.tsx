import { useGameStore, RumorReport } from '../store/gameStore'

interface Props {
  report: RumorReport
  onClose: () => void
}

export default function RumorReportModal({ report, onClose }: Props) {
  const isGood = report.direction === 'good'
  const icon = isGood ? '🟢' : '🔴'
  const title = isGood ? '谣言利好' : '谣言利空'
  const accentColor = isGood ? 'text-green-300' : 'text-red-300'
  const gradientBg = isGood
    ? 'linear-gradient(90deg, #0c4119 0%, #061a0c 100%)'
    : 'linear-gradient(90deg, #4a0e0e 0%, #1a0606 100%)'
  const borderColor = isGood ? 'border-green-700' : 'border-red-700'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className={`bg-secondary rounded-xl shadow-2xl overflow-hidden border-2 ${borderColor}`}
        style={{ maxWidth: '520px', maxHeight: '80vh', width: '90vw' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="px-4 py-3 border-b border-gray-700 flex items-center justify-between"
          style={{ background: gradientBg }}
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <div>
              <div className={`text-sm font-bold ${accentColor}`}>{title}</div>
              <div className="text-[10px] text-gray-400">谣言已散布（其他玩家可能被诱惑）</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center"
          >×</button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '64vh' }}>
          <div className="bg-black/40 rounded-lg p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">目标</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-lg font-bold ${accentColor}`}>
                {report.targetName}
              </span>
              <span className="text-xs text-gray-500">{report.targetSymbol}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300">
                {report.targetType}
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              持续天数：<span className="text-white font-bold">{report.eventDays}</span> 天
            </div>
          </div>

          <div className="bg-black/40 rounded-lg p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-2">📰 你散布的消息内容</div>
            <div className={`text-sm leading-relaxed ${accentColor}`}>
              {report.newsContent}
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3">
            <div className="text-xs text-yellow-300 leading-relaxed">
              💡 <span className="font-bold">提示：</span>
              {report.hint}
            </div>
            <div className="text-xs text-gray-400 mt-2 leading-relaxed">
              其他玩家可能受谣言影响而产生交易行为，但消息本身
              <span className="text-yellow-300">不会立即改变真实价格</span>，
              真实价格变动由市场参与者综合反应决定。
            </div>
          </div>

          <div className="text-[10px] text-gray-500 italic text-center pt-2 border-t border-gray-700">
            ⚠️ 谣言的真实效果取决于市场反应，不保证涨跌
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook：使用 store 中的 rumorReport
export function useRumorReport() {
  const rumorReport = useGameStore(s => s.rumorReport)
  const setRumorReport = useGameStore(s => s.setRumorReport)
  return { rumorReport, closeRumorReport: () => setRumorReport(null) }
}
