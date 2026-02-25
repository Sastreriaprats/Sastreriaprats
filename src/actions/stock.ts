'use server'

export async function updateStock(): Promise<{ success?: boolean; error?: string }> {
  try {
    return { success: true }
  } catch (err) {
    console.error('[updateStock]', err)
    return { error: err instanceof Error ? err.message : 'Error al actualizar stock' }
  }
}