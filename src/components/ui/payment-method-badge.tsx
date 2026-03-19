const CONFIG: Record<string, { label: string; cls: string }> = {
  cash:          { label: 'Efectivo',      cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  efectivo:      { label: 'Efectivo',      cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  card:          { label: 'Tarjeta',       cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  tarjeta:       { label: 'Tarjeta',       cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  bizum:         { label: 'Bizum',         cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  transfer:      { label: 'Transferencia', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
  transferencia: { label: 'Transferencia', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
  check:         { label: 'Cheque',        cls: 'bg-gray-500/15 text-gray-400 border-gray-500/20' },
  cheque:        { label: 'Cheque',        cls: 'bg-gray-500/15 text-gray-400 border-gray-500/20' },
  voucher:       { label: 'Vale',          cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  vale:          { label: 'Vale',          cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  mixed:         { label: 'Mixto',         cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' },
}

export function PaymentMethodBadge({ method }: { method: string | null | undefined }) {
  if (!method) return null
  const cfg = CONFIG[method.toLowerCase()]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg?.cls ?? 'bg-gray-500/15 text-gray-400 border-gray-500/20'}`}>
      {cfg?.label ?? method}
    </span>
  )
}
