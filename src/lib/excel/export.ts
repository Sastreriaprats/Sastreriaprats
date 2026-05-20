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

/**
 * Exporta varias hojas en un solo Excel. Útil para reportes con
 * resumen + detalle (ej. modelo 303 IVA trimestral: una hoja
 * resumen + una hoja por tipo de factura).
 *
 * Uso:
 *   await downloadExcelMulti([
 *     { name: 'Resumen', rows: [...] },
 *     { name: 'Facturas emitidas', rows: [...] },
 *     { name: 'Facturas recibidas', rows: [...] },
 *   ], 'iva-trimestral-2026')
 *
 * Los nombres de hoja se truncan a 31 caracteres (límite de xlsx) y
 * se eliminan caracteres prohibidos (\ / ? * [ ]).
 */
export async function downloadExcelMulti(
  sheets: Array<{ name: string; rows: Record<string, unknown>[] }>,
  filename: string,
): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const usedNames = new Set<string>()
  for (const sheet of sheets) {
    // Sanear nombre: quitar caracteres prohibidos y limitar a 31 chars.
    let name = (sheet.name || 'Hoja').replace(/[\\/?*[\]]/g, '').slice(0, 31).trim() || 'Hoja'
    // Evitar duplicados (xlsx fallaría).
    let suffix = 1
    let candidate = name
    while (usedNames.has(candidate)) {
      const tail = ` (${++suffix})`
      candidate = (name.slice(0, 31 - tail.length) + tail).trim()
    }
    name = candidate
    usedNames.add(name)

    const ws = XLSX.utils.json_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
