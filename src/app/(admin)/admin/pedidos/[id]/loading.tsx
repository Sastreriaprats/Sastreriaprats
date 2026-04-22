export default function Loading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto py-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-4 w-60 rounded bg-muted" />
        <div className="flex items-center justify-between">
          <div className="h-8 w-72 rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded bg-muted" />
            <div className="h-9 w-28 rounded bg-muted" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
      </div>

      <div className="flex gap-1 border-b">
        <div className="h-9 w-24 rounded-t bg-muted" />
        <div className="h-9 w-24 rounded-t bg-muted/70" />
        <div className="h-9 w-24 rounded-t bg-muted/70" />
        <div className="h-9 w-24 rounded-t bg-muted/70" />
      </div>

      <div className="space-y-3">
        <div className="h-28 rounded-lg bg-muted" />
        <div className="h-28 rounded-lg bg-muted" />
        <div className="h-28 rounded-lg bg-muted" />
      </div>
    </div>
  )
}
