'use client'

import { useState } from 'react'

export function HeroVideo({ videoUrl }: { videoUrl: string }) {
  const [videoReady, setVideoReady] = useState(false)

  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      onCanPlay={() => setVideoReady(true)}
      className={`absolute inset-0 w-full h-full object-cover object-[center_25%] transition-opacity duration-700 ${
        videoReady ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <source src={videoUrl} type={videoUrl.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
    </video>
  )
}
