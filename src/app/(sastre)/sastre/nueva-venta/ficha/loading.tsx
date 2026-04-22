export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a1020]">
      <div className="max-w-5xl mx-auto pt-6 px-6 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-4 w-56 rounded bg-white/10" />
          <div className="h-9 w-24 rounded bg-white/10" />
        </div>

        <div className="flex items-center gap-3 mb-8">
          <div className="h-8 w-8 rounded-full bg-white/10" />
          <div className="h-1 flex-1 rounded bg-white/5" />
          <div className="h-8 w-8 rounded-full bg-white/10" />
          <div className="h-1 flex-1 rounded bg-white/5" />
          <div className="h-8 w-8 rounded-full bg-white/10" />
        </div>

        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-6 space-y-4">
          <div className="h-6 w-48 rounded bg-white/10" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-white/10" />
              <div className="h-10 rounded bg-white/10" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-white/10" />
              <div className="h-10 rounded bg-white/10" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-white/10" />
              <div className="h-10 rounded bg-white/10" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-white/10" />
              <div className="h-10 rounded bg-white/10" />
            </div>
          </div>
          <div className="h-32 rounded bg-white/10" />
        </div>

        <div className="flex justify-between mt-6">
          <div className="h-10 w-28 rounded bg-white/10" />
          <div className="h-10 w-32 rounded bg-white/10" />
        </div>
      </div>
    </div>
  )
}
