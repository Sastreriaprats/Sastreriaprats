import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const slugs = JSON.parse(readFileSync(new URL('./_web-slugs.json', import.meta.url), 'utf8'))
const newProd = new Set(slugs.products.map(p => p.slug))
const newCats = new Set(slugs.categories.map(c => c.slug))

// Leer URLs antiguas del sharedStrings.xml ya extraido
const xml = readFileSync(join(tmpdir(), 'urls_xlsx', 'unz', 'xl', 'sharedStrings.xml'), 'utf8')
const urls = [...xml.matchAll(/https?:\/\/www\.sastreriaprats\.com[^<]*/g)].map(m => m[0])

const prodHandles = [...new Set(urls.filter(u => /\/products\/[^/?]+$/.test(u)).map(u => u.split('/products/')[1]))]
const collHandles = [...new Set(urls.filter(u => /\/collections\/[^/?]+$/.test(u)).map(u => u.split('/collections/')[1]))]

const pMatch = prodHandles.filter(h => newProd.has(h))
const pNo = prodHandles.filter(h => !newProd.has(h))
const cMatch = collHandles.filter(h => newCats.has(h))
const cNo = collHandles.filter(h => !newCats.has(h))

console.log('PRODUCTOS Shopify:', prodHandles.length, '| coinciden:', pMatch.length, '| NO:', pNo.length)
console.log('COLECCIONES Shopify:', collHandles.length, '| coinciden:', cMatch.length, '| NO:', cNo.length)
console.log('\n-- colecciones que SI coinciden --\n', cMatch.join(', '))
console.log('\n-- colecciones que NO coinciden --\n', cNo.join(', '))
console.log('\n-- ejemplos productos que NO coinciden (20) --')
pNo.slice(0, 20).forEach(h => console.log('  ', h))
