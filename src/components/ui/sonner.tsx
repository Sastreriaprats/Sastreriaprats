"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          error:
            "group-[.toaster]:!bg-[#1B2A4A] group-[.toaster]:!text-white group-[.toaster]:!border-[#C4854C]",
          success:
            "group-[.toaster]:!bg-emerald-900 group-[.toaster]:!text-white group-[.toaster]:!border-emerald-700",
          warning:
            "group-[.toaster]:!bg-amber-900 group-[.toaster]:!text-white group-[.toaster]:!border-amber-600",
          info:
            "group-[.toaster]:!bg-[#1B2A4A] group-[.toaster]:!text-white group-[.toaster]:!border-[#C4854C]/50",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
