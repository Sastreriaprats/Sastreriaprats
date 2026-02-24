'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import type { ActionResult } from '@/lib/errors'

interface UseActionOptions<TOutput> {
  onSuccess?: (data: TOutput) => void
  onError?: (error: string) => void
  successMessage?: string
  errorMessage?: string
}

export function useAction<TInput, TOutput>(
  action: (input: TInput) => Promise<ActionResult<TOutput>>,
  options: UseActionOptions<TOutput> = {},
) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TOutput | null>(null)

  const execute = useCallback(async (input: TInput) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await action(input)

      if (result.success) {
        setData(result.data)
        if (options.successMessage) toast.success(options.successMessage)
        await options.onSuccess?.(result.data)
        return result.data
      } else {
        setError(result.error)
        toast.error(options.errorMessage || result.error)
        options.onError?.(result.error)
        return null
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Error inesperado'
      setError(errorMsg)
      toast.error(errorMsg)
      options.onError?.(errorMsg)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [action, options])

  const reset = useCallback(() => {
    setError(null)
    setData(null)
  }, [])

  return { execute, isLoading, error, data, reset }
}
