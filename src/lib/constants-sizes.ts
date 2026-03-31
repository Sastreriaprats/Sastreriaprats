/** Plantillas de tallas para variantes de producto */
export const SIZE_TEMPLATES: Record<string, { label: string; sizes: string[] }> = {
  americanas:    { label: 'Americanas',         sizes: ['44','46','48','50','52','54','56','58','60'] },
  camisas:       { label: 'Camisas (número)',   sizes: ['37','38','39','40','41','42','43','44'] },
  cinturones:    { label: 'Cinturones',         sizes: ['80','85','90','95','100','105','110'] },
  generico:      { label: 'Genérico (XS-XXXL)', sizes: ['XS','S','M','M/L','L','XL','XXL','XXXL'] },
  pantalones:    { label: 'Pantalones',         sizes: ['38','40','42','44','46','48','50','52','54','56','58','60'] },
  pantalones_us: { label: 'Pantalones USA',     sizes: ['28','29','30','31','32','33','34','35','36','37','38','39','40','41','42'] },
  trajes:        { label: 'Trajes',             sizes: ['44/38','46/40','48/42','50/44','52/46','54/48','56/50','58/52','60/54'] },
  unica:         { label: 'Talla única',        sizes: ['U'] },
  zapatos_eu:    { label: 'Zapatos EU',         sizes: ['38','38.5','39','39.5','40','40.5','41','41.5','42','43','43.5','44','44.5','45','45.5','46'] },
  zapatos_uk:    { label: 'Zapatos UK',         sizes: ['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13'] },
}

/** Genera variant_sku limpio a partir de SKU base + talla */
export function variantSkuFromSize(baseSku: string, size: string): string {
  const clean = size.replace(/\//g, '-').replace(/\./g, '').replace(/\s+/g, '')
  return `${baseSku}-${clean}`
}
