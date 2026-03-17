'use client'

const BILLS = [500, 200, 100, 50, 20, 10, 5]
const COINS = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]

const formatDenom = (d: number) =>
  d >= 1 ? `${d} €` : `${Math.round(d * 100)} ct`

function calcTotal(qty: Record<string, number>): number {
  let total = 0
  for (const [denom, count] of Object.entries(qty)) {
    total += parseFloat(denom) * (count || 0)
  }
  return Math.round(total * 100) / 100
}

interface CashCounterProps {
  value: Record<string, number>
  onChange: (value: Record<string, number>, total: number) => void
  label?: string
  readOnly?: boolean
  variant?: 'light' | 'dark'
}

export function CashCounter({
  value,
  onChange,
  label,
  readOnly = false,
  variant = 'light',
}: CashCounterProps) {
  const isDark = variant === 'dark'

  const total = calcTotal(value)

  function handleChange(denom: number, qty: number) {
    const next = { ...value, [String(denom)]: Math.max(0, qty || 0) }
    onChange(next, calcTotal(next))
  }

  const subtitleClass = isDark
    ? 'text-xs font-semibold uppercase tracking-[0.12em] text-[#c9a96e] mb-2 mt-1'
    : 'text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 mt-1'

  const rowClass = isDark
    ? 'flex items-center gap-2 py-1.5 border-b border-white/[0.06]'
    : 'flex items-center gap-2 py-1.5 border-b border-slate-100'

  const denomClass = isDark
    ? 'w-14 text-right text-sm font-medium text-white/80'
    : 'w-14 text-right text-sm font-medium text-slate-700'

  const multiplyClass = isDark ? 'text-white/30 text-sm' : 'text-slate-400 text-sm'

  const inputClass = isDark
    ? 'w-14 h-8 text-center text-sm font-medium rounded-lg border border-white/20 bg-white/[0.07] text-white placeholder:text-white/30 focus:outline-none focus:border-[#c9a96e] focus:ring-1 focus:ring-[#c9a96e]/30 transition-all disabled:opacity-50'
    : 'w-14 h-8 text-center text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A] transition-all disabled:opacity-50 disabled:bg-slate-50'

  const subtotalClass = isDark
    ? 'w-20 text-right text-sm tabular-nums text-white/60'
    : 'w-20 text-right text-sm tabular-nums text-slate-500'

  const totalBarClass = isDark
    ? 'mt-4 pt-4 border-t border-white/10 flex items-center justify-between'
    : 'mt-4 pt-4 border-t border-slate-200 flex items-center justify-between'

  const totalLabelClass = isDark
    ? 'text-sm font-semibold uppercase tracking-wider text-white/50'
    : 'text-sm font-semibold uppercase tracking-wider text-slate-500'

  const totalValueClass = isDark
    ? 'text-2xl font-bold tabular-nums text-white'
    : 'text-2xl font-bold tabular-nums text-slate-800'

  function renderRow(denom: number) {
    const qty = value[String(denom)] || 0
    const subtotal = qty * denom
    return (
      <div key={denom} className={rowClass}>
        <span className={denomClass}>{formatDenom(denom)}</span>
        <span className={multiplyClass}>×</span>
        <input
          type="number"
          min="0"
          value={qty === 0 ? '' : qty}
          placeholder="0"
          disabled={readOnly}
          onChange={e => handleChange(denom, parseInt(e.target.value) || 0)}
          className={inputClass}
        />
        <span className={multiplyClass}>=</span>
        <span className={subtotalClass}>
          {subtotal > 0 ? subtotal.toFixed(2) + ' €' : '—'}
        </span>
      </div>
    )
  }

  return (
    <div>
      {label && (
        <p className={isDark
          ? 'text-sm font-medium text-white/70 mb-3'
          : 'text-sm font-medium text-slate-700 mb-3'
        }>
          {label}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <div>
          <p className={subtitleClass}>💶 Billetes</p>
          {BILLS.map(renderRow)}
        </div>
        <div>
          <p className={subtitleClass}>🪙 Monedas</p>
          {COINS.map(renderRow)}
        </div>
      </div>

      <div className={totalBarClass}>
        <span className={totalLabelClass}>Total</span>
        <span className={totalValueClass}>{total.toFixed(2)} €</span>
      </div>
    </div>
  )
}
