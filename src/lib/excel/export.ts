/**
 * Helper para exportar listas tabulares a Excel (.xlsx).
 *
 * El módulo `xlsx` pesa ~700 KB, así que se carga DINÁMICAMENTE — solo
 * entra al bundle del cliente cuando el usuario pulsa "Descargar Excel".
 *
 * Uso:
 *   const data = filteredRows.map(r => ({ 'Nº Factura': r.invoice_number, ... }))
 *   await downloadExcel(data, 'facturas-2026-05', 'Facturas')
 */
export async function downloadExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = 'Datos',
): Promise<void> {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
