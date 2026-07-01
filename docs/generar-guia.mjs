import { createRequire } from 'node:module'
import { mkdirSync, createWriteStream } from 'node:fs'
const require = createRequire(import.meta.url)
const PDFDocument = require('pdfkit')

const NAVY='#16243f', GOLD='#a8842f', INK='#2c3340', MUTE='#6b7280'
const BEIGE='#f6f2e9', GOLD_BD='#d8c089', AMBER_BG='#fdf6e3', AMBER_BD='#e3c469', ADMIN_BG='#eef2f8', ADMIN_BD='#c3cfe0'
const M=54, PW=595.28, PH=841.89, CW=PW-M*2
const FN='Helvetica', FB='Helvetica-Bold', FI='Helvetica-Oblique'

const doc=new PDFDocument({size:'A4',margins:{top:M,bottom:M,left:M,right:M},bufferPages:true})
const out='docs/Guia-uso-plataforma-Sastreria-Prats.pdf'
mkdirSync('docs',{recursive:true})
doc.pipe(createWriteStream(out))

const maxY=()=>PH-M-24
const ensure=(h)=>{ if(doc.y+h>maxY()) doc.addPage() }

// part helpers
const t=(s)=>({s}), b=(s)=>({s,b:1}), it=(s)=>({s,i:1}), nav=(s)=>({s,b:1,c:NAVY})
const plain=(parts)=>parts.map(p=>typeof p==='string'?p:p.s).join('')

// rich paragraph at x,width
function rich(parts,{x=M,width=CW,size=10.5,lh=1.32,color=INK,indent=0}={}){
  doc.fontSize(size)
  const arr=parts.map(p=>typeof p==='string'?{s:p}:p)
  const sy=doc.y
  for(let i=0;i<arr.length;i++){
    const p=arr[i]
    doc.font(p.b?FB:p.i?FI:FN).fillColor(p.c||color)
    const isLast=i===arr.length-1
    if(i===0) doc.text(p.s, x, sy, {width,lineGap:(lh-1)*size,continued:!isLast,indent})
    else doc.text(p.s, {continued:!isLast})
  }
  doc.fillColor(INK)
}
const measure=(parts,{width=CW,size=10.5,lh=1.32,indent=0}={})=>{
  doc.fontSize(size).font(FN)
  return doc.heightOfString(plain(parts),{width:width-indent,lineGap:(lh-1)*size})
}

function para(parts,opts={}){ const h=measure(parts,opts); ensure(h); rich(parts,opts); doc.moveDown(0.45) }

function heading(s,{size,color,top,bottom,page}={}){
  if(page){ if(doc.bufferedPageRange().count>0 && (doc.y>M+2 || pageStarted)) doc.addPage() }
  else ensure(size+ (top||0) +6)
  if(top) doc.y+=top
  doc.font(FB).fontSize(size).fillColor(color).text(s,M,doc.y,{width:CW})
  doc.fillColor(INK)
  if(bottom) doc.y+=bottom
}
let pageStarted=false
const H1=(s)=>{ doc.addPage(); pageStarted=true
  // banda dorada
  doc.save(); doc.rect(M,doc.y,4,24).fill(GOLD); doc.restore()
  doc.font(FB).fontSize(21).fillColor(NAVY).text(s,M+12,doc.y+1,{width:CW-12})
  doc.fillColor(INK); doc.moveDown(0.6) }
const H2=(s)=>{ ensure(34); doc.y+=8; doc.font(FB).fontSize(13.5).fillColor(GOLD).text(s,M,doc.y,{width:CW}); doc.fillColor(INK); doc.moveDown(0.25) }
const H3=(s)=>{ ensure(24); doc.y+=4; doc.font(FB).fontSize(11.5).fillColor(NAVY).text(s,M,doc.y,{width:CW}); doc.fillColor(INK); doc.moveDown(0.2) }

function listBlock(items,{ordered=false}={}){
  const gap=18, x0=M+gap
  for(let i=0;i<items.length;i++){
    const parts=Array.isArray(items[i])?items[i]:[items[i]]
    const h=measure(parts,{width:CW-gap})
    ensure(h+3)
    const yTop=doc.y
    doc.font(FB).fontSize(10.5).fillColor(GOLD).text(ordered?`${i+1}.`:'•', M+2, yTop, {width:gap-4,align:ordered?'right':'left'})
    doc.y=yTop
    rich(parts,{x:x0,width:CW-gap})
    doc.moveDown(0.32)
  }
  doc.moveDown(0.15)
}

function box({title,items,fill,border}){
  const innerW=CW-24
  // medir
  let h=12
  const lines=[]
  if(title){ const hh=measure([b(title)],{width:innerW}); lines.push({parts:[nav(title)],h:hh,gap:4}); h+=hh+4 }
  for(const it of items){
    if(it.bullet){ const hh=measure(it.parts,{width:innerW-14}); lines.push({...it,h:hh}); h+=hh+3 }
    else { const hh=measure(it.parts,{width:innerW}); lines.push({...it,h:hh}); h+=hh+3 }
  }
  ensure(h+8)
  const yTop=doc.y
  doc.save(); doc.lineWidth(1).fillColor(fill).strokeColor(border).rect(M,yTop,CW,h).fillAndStroke(); doc.restore()
  let y=yTop+8
  doc.fillColor(INK)
  for(const ln of lines){
    if(ln.bullet){
      doc.font(FB).fontSize(10.5).fillColor(GOLD).text('•',M+12,y,{width:12})
      doc.y=y; rich(ln.parts,{x:M+26,width:innerW-14})
    } else {
      doc.y=y; rich(ln.parts,{x:M+12,width:innerW})
    }
    y=doc.y+(ln.gap||3)
  }
  doc.y=yTop+h+8
}

// ════════ PORTADA ════════
pageStarted=true
doc.y=150
doc.font(FB).fontSize(16).fillColor(GOLD).text('S A S T R E R Í A   P R A T S',M,doc.y,{width:CW,align:'center',characterSpacing:1})
doc.moveDown(0.3)
doc.save(); doc.moveTo(PW/2-100,doc.y).lineTo(PW/2+100,doc.y).lineWidth(1).strokeColor(GOLD).stroke(); doc.restore()
doc.moveDown(1.2)
doc.font(FB).fontSize(30).fillColor(NAVY).text('Guía de uso de la plataforma',M,doc.y,{width:CW,align:'center'})
doc.moveDown(0.3)
doc.font(FN).fontSize(14).fillColor(INK).text('Manual práctico por roles',M,doc.y,{width:CW,align:'center'})
doc.moveDown(2)
doc.font(FB).fontSize(13).fillColor(NAVY).text('Administrador   ·   Sastre   ·   Vendedor',M,doc.y,{width:CW,align:'center'})
doc.y=PH-150
doc.font(FN).fontSize(10).fillColor(MUTE).text('Julio de 2026',M,doc.y,{width:CW,align:'center'})

// ════════ INTRO ════════
H1('Antes de empezar')
para([t('Esta guía explica, paso a paso y con palabras sencillas, qué puede hacer cada persona del equipo en la plataforma de Sastrería Prats. Está dividida en tres partes según tu puesto: Administrador, Sastre y Vendedor. Busca tu sección y léela; al final hay una tabla rápida con "quién puede qué".')])
box({fill:BEIGE,border:GOLD_BD,title:'La idea más importante',items:[
  {parts:[b('Casi cualquier error se corrige desde la propia pantalla, sin llamar a nadie técnico.')]},
  {parts:[t('Cuando corriges algo (borras un cobro, cancelas un pedido, anulas una devolución…), la plataforma ajusta sola la caja y el stock. No tienes que recalcular nada a mano: el sistema cuadra los números por ti.')]},
]})
H2('Cómo entrar y moverte')
para([t('Entras con tu correo y contraseña. Según tu puesto verás un menú a la izquierda con distintas secciones: cada persona ve solo lo que su puesto permite usar. Si no ves una opción que se menciona en la guía, es porque tu puesto no la tiene (y la hará el Administrador).')])
para([t('En la guía, las rutas del menú se escriben en azul y con flechas. Por ejemplo: '),nav('Contabilidad » Movimientos'),t(' significa: pulsa "Contabilidad" en el menú y luego la pestaña "Movimientos".')])

// ════════ 1. ADMINISTRADOR ════════
H1('1. Administrador')
para([t('El Administrador puede hacer absolutamente todo en la plataforma. Es quien resuelve los errores que los demás no pueden corregir y quien lleva la contabilidad, la caja y los informes. Esta es la sección más larga porque cubre tanto el día a día como las correcciones.')])
H2('Tu menú')
para([t('En la columna de la izquierda tienes, entre otras, estas secciones:')])
listBlock([
  [b('Dashboard'),t(' — resumen del día.')],
  [b('Clientes'),t(' — fichas de clientes y medidas.')],
  [b('Pedidos y Reservas'),t(' — los pedidos de confección.')],
  [b('TPV / Caja'),t(' — abrir el terminal de venta y la caja.')],
  [b('Tickets'),t(' — las ventas de tienda ya hechas (y, dentro, los Vales).')],
  [b('Devoluciones'),t(' — devoluciones realizadas (y anularlas).')],
  [b('Productos y Stock'),t(' — catálogo, almacenes, movimientos.')],
  [b('Contabilidad'),t(' — facturas, presupuestos, movimientos de caja, IVA y resúmenes de caja; e incluye '),b('Facturas proveedores'),t(' y '),b('Vencimientos'),t('.')],
  [b('Cobros pendientes'),t(', '),b('Informes'),t(', '),b('Configuración'),t(' y '),b('Seguimiento'),t(' (auditoría: quién hizo cada cosa).')],
])
H2('El día a día')
H3('Pedidos de confección')
para([t('En '),nav('Pedidos y Reservas'),t(' tienes la lista. Para crear uno nuevo pulsa "Nuevo producto"; para trabajar un pedido, pulsa sobre él. Dentro verás cuatro pestañas: '),b('Prendas'),t(', '),b('Historial'),t(', '),b('Pruebas'),t(' y '),b('Pagos'),t('.')])
listBlock([
  [b('Cambiar el estado del pedido'),t(': pulsa el botón "Estado del pedido", elige el nuevo estado y pulsa "Confirmar cambio". Los estados van de "Creado" a "Entregado al cliente".')],
  [b('Cobros'),t(': en la pestaña "Pagos" registras, editas o borras cobros.')],
])
H3('Registrar un cobro de un pedido')
listBlock([
  'Abre el pedido y entra en la pestaña "Pagos".',
  'Pulsa "Registrar pago".',
  'Elige fecha, método (Efectivo, Tarjeta, Bizum, Transferencia o Cheque) e importe. Puedes añadir referencia y fecha del próximo pago si es a plazos.',
  'Pulsa "Guardar pago". El cobro entra automáticamente en la caja del día.',
],{ordered:true})
H3('Ventas de tienda, clientes, stock e informes')
listBlock([
  [b('Ventas (Tickets)'),t(': las ventas de mostrador se hacen en el '),nav('TPV / Caja'),t(' (ver sección "Vendedor"); luego las consultas en '),nav('Tickets'),t(', donde puedes corregir métodos de pago, editar líneas o anular una venta.')],
  [b('Clientes y Stock'),t(': fichas, medidas, catálogo, almacenes y traspasos.')],
  [b('Vales'),t(': se consultan en '),nav('Tickets » Vales'),t('.')],
  [b('Informes'),t(': en '),nav('Informes'),t(' tienes las estadísticas de ventas. Solo el Administrador ve los informes.')],
])
H2('Corregir errores (lo que solo tú puedes hacer)')
para([t('Aquí está lo importante: cómo deshacer y arreglar cosas. En casi todos los casos la plataforma ajusta la caja y el stock sola.')])
H3('Corregir la caja a mano (meter un gasto o un ingreso)')
para([t('Para cuadrar la caja con un movimiento que no viene de una venta (un gasto, un ingreso suelto, devolver dinero en efectivo…), ve a '),nav('Contabilidad » Movimientos'),t(' y pulsa "Nuevo movimiento".')])
listBlock([
  'Elige si es "Ingreso" o "Gasto".',
  'Pon la fecha, una descripción clara, el importe y la categoría (Alquiler, Nóminas, Suministros, etc.).',
  'Elige la forma de pago y, si quieres, deja marcado "Generar asiento contable automáticamente".',
  'Pulsa "Guardar". Queda reflejado en la caja y la contabilidad.',
],{ordered:true})
para([t('Para editar o borrar un movimiento manual, usa los botones de su propia fila en la lista de Movimientos.')])
H3('Editar o borrar una retirada de efectivo')
para([t('Una retirada de caja (una extracción de efectivo o un gasto pagado desde el cajón) NO se corrige desde "Movimientos": se corrige en su propia sesión de caja. Ve a '),nav('Contabilidad'),t(', abre la '),b('sesión de caja'),t(' del día y la tienda donde se hizo, y en la lista de movimientos, sobre la retirada, verás dos iconos:')])
listBlock([
  [b('Lápiz (editar)'),t(': cambia el importe o el motivo si solo eso estaba mal.')],
  [b('Papelera (borrar)'),t(': elimina la retirada entera.')],
])
para([t('En ambos casos la plataforma '),b('ajusta el arqueo sola'),t(' (efectivo esperado y descuadre), esté la caja abierta o cerrada. Antes de borrar sale un aviso de confirmación.')])
H3('Corregir, reabrir o borrar una sesión de caja')
para([t('Desde el detalle de una '),b('sesión de caja'),t(' en '),nav('Contabilidad'),t(' puedes:')])
listBlock([
  [b('Editar el arqueo'),t(': corrige el fondo inicial, o el efectivo contado y las notas de cierre (botón "Editar arqueo de caja"). La plataforma recalcula el efectivo esperado y el descuadre.')],
  [b('Reabrir una sesión cerrada'),t(' (botón "Reabrir"): mientras esté abierta, los nuevos cobros y retiradas de esa tienda se atribuyen a esa sesión, no a una nueva. No se puede reabrir si la tienda ya tiene otra caja abierta.')],
  [b('Borrar una sesión'),t(': solo si está '),b('vacía'),t(' (sin ventas ni retiradas).')],
])
H3('Cancelar un pedido')
para([t('Abre el pedido, pulsa "Estado del pedido", elige "Cancelado" y confirma. Según si el pedido ya se entregó:')])
listBlock([
  [b('Si NO está entregado'),t(' y tenía cobros: al cancelar, el sistema '),b('devuelve el dinero solo'),t(' (revierte los cobros en la caja). No haces nada más.')],
  [b('Si YA está entregado'),t(': el cliente tiene la prenda, así que el sistema '),b('no reembolsa automáticamente'),t('. Si quieres devolver el dinero, mételo a mano como un gasto en la caja.')],
])
box({fill:AMBER_BG,border:AMBER_BD,title:'El aviso que verás en pantalla',items:[
  {parts:[t('Cuando el pedido está entregado y tiene cobros, la plataforma muestra: "Este pedido ya está entregado y tiene cobros registrados. Al cancelarlo NO se reembolsan automáticamente (el cliente ya tiene la prenda). Si quieres devolver el dinero, regístralo a mano como un gasto en la caja (devolución de pedido)."')]},
]})
box({fill:AMBER_BG,border:AMBER_BD,title:'Cancelar es definitivo',items:[
  {parts:[t('Un pedido cancelado NO se puede reactivar desde la plataforma: es un estado final. Si lo cancelas por error no podrás recuperarlo tú — avísanos y lo reactivamos nosotros. Antes de cancelar, asegúrate.')]},
]})
H3('Renumerar o cambiar de tienda un pedido')
para([t('Abre el pedido y pulsa "Editar pedido". Cambia la tienda y guarda. Si el número ya no encaja con la nueva tienda, la plataforma pregunta automáticamente "¿Renumerar el pedido a la nueva tienda?": elige "Renumerar" (le da el siguiente número libre de esa tienda) o "Mantener número". Si tenía cobros, los apuntes de caja se actualizan solos al número nuevo.')])
H3('Editar o borrar un cobro')
listBlock([
  [b('Borrar un cobro'),t(': en la pestaña "Pagos", pulsa la papelera y confirma. El sistema revierte el dinero en la caja (y recalcula el arqueo si la caja ya estaba cerrada).')],
  [b('Editar un cobro'),t(' (importe o método): solo el Administrador. Pulsa el lápiz, cambia y guarda.')],
])
H3('Anular o corregir una venta de tienda (ticket)')
para([t('Las ventas de mostrador se corrigen en '),nav('Tickets'),t('. Abre el ticket y, según lo que falle:')])
listBlock([
  [b('Editar los cobros'),t(' (repartir el importe entre métodos sin cambiar el total) o el '),b('cliente y las notas'),t('.')],
  [b('Editar las líneas'),t(' (precio, descuento, cantidades): solo el Administrador. La plataforma ajusta stock, caja y contabilidad.')],
  [b('Anular la venta entera'),t(' (solo el Administrador): primero muestra una previsualización de lo que se deshace (stock que vuelve a contar, caja, contabilidad) y, si la venta tenía retiradas ligadas, te deja borrarlas a la vez. Confirma para anular.')],
  [b('Generar factura'),t(' de la venta si el cliente la pide.')],
])
H3('Anular una devolución hecha por error')
para([t('Ve a '),nav('Devoluciones'),t(', abre la devolución y pulsa "Anular devolución". La plataforma muestra primero una previsualización de lo que va a deshacer (el vale que se cancela, el stock que vuelve a contar como vendido, la venta que se restaura). Si todo está bien, pulsa "Confirmar anulación".')])
box({fill:AMBER_BG,border:AMBER_BD,title:'Cuándo NO se puede anular',items:[
  {parts:[t('La plataforma bloquea la anulación y explica el motivo si:')]},
  {bullet:1,parts:[t('El vale que generó la devolución ya se ha gastado (total o parcialmente).')]},
  {bullet:1,parts:[t('La devolución fue un cambio por otro producto: hay que deshacer la venta del cambio aparte.')]},
  {bullet:1,parts:[t('La venta original tiene varias devoluciones (no se sabe con certeza qué líneas restaurar).')]},
]})
H3('Limpiar movimientos de stock "huérfanos"')
para([t('A veces, al borrar una venta o un pedido a proveedor, queda colgado un registro de movimiento de stock sin su origen. Para limpiarlos: '),nav('Productos y Stock » Movimientos'),t(' y, en el recuadro "Integridad de inventario", pulsa "Buscar movimientos huérfanos". Si aparece alguno, pulsa "Limpiar" y confirma. Esto solo borra el registro colgado: '),b('no cambia el stock actual'),t('.')])
H3('Desactivar o reactivar un cliente')
para([t('En la ficha de un cliente ('),nav('Clientes'),t(' » abrir cliente) tienes un botón "Desactivar" para darlo de baja sin borrarlo, y "Reactivar" para volver a activarlo. Es reversible.')])
H3('Facturas de proveedor y vencimientos')
para([t('En '),nav('Contabilidad » Facturas proveedores'),t(' registras las facturas que llegan ("Nueva factura") y, desde cada fila, "Registrar pago". Los plazos pendientes se ven en '),nav('Contabilidad » Vencimientos'),t('.')])
box({fill:BEIGE,border:GOLD_BD,items:[
  {parts:[t('Si borras un pago de una factura de proveedor, las cuotas (los plazos marcados como pagados) se recalculan solas: la plataforma vuelve a marcar como pendiente lo que el dinero ya no cubre. No tocas las cuotas a mano.')]},
]})

// ════════ 2. SASTRE ════════
H1('2. Sastre')
para([t('El Sastre gestiona los pedidos de confección de principio a fin y atiende la tienda. Tiene acceso al TPV y a la caja, pero las correcciones contables y de caja las hace el Administrador.')])
H2('Tu menú')
listBlock([
  [b('Nueva venta'),t(' — abrir el TPV para vender.')],
  [b('Calendario'),t(', '),b('Clientes'),t(' (con "Tomar medidas"), '),b('Stock'),t(', '),b('Arreglos'),t('.')],
  [b('Pedidos'),t(' — los pedidos de confección.')],
  [b('Oficiales'),t(' — los sastres/talleres externos.')],
  [b('Caja TPV'),t(' — abrir y cerrar la caja. '),b('Cobros'),t(' — cobros pendientes.')],
])
H2('Pedidos de confección')
para([t('En '),nav('Pedidos'),t(' está tu lista. Para crear uno, pulsa "Nuevo producto"; para trabajarlo, pulsa "Ver". Dentro puedes:')])
listBlock([
  [b('Cambiar el estado de cada prenda'),t(' con su selector (Creado, En producción, En prueba, Finalizado…). Cuando una prenda está terminada, pulsa "Marcar entregado".')],
  [b('Editar el pedido'),t(', añadir arreglos ("+ Nuevo arreglo"), descargar o editar la ficha de cada prenda.')],
  [b('Cambiar el estado general del pedido'),t(' con el selector de la cabecera (incluye "Cancelado").')],
  [b('Registrar cobros'),t(' en la sección de Pagos (igual que el Administrador: "Registrar pago").')],
  [b('Imprimir'),t(' el ticket del pedido o la ficha de cada prenda.')],
])
H2('Tienda y caja')
para([t('Puedes vender en el TPV ('),nav('Nueva venta'),t(' o '),nav('Caja TPV'),t(') y abrir/cerrar la caja, igual que un vendedor (ver la sección "Vendedor"). También gestionas clientes y medidas, stock (ver y editar), productos y reservas, y puedes consultar (solo ver) la contabilidad y los proveedores.')])
box({fill:ADMIN_BG,border:ADMIN_BD,title:'Esto lo hace el Administrador',items:[
  {parts:[t('El Sastre NO puede:')]},
  {bullet:1,parts:[t('Borrar un pedido por completo.')]},
  {bullet:1,parts:[t('El arqueo y los ajustes manuales de caja (meter gastos/ingresos sueltos).')]},
  {bullet:1,parts:[t('Anular una devolución.')]},
  {bullet:1,parts:[t('Editar un cobro (cambiar su importe o método).')]},
  {bullet:1,parts:[t('Editar o borrar una retirada de caja, y reabrir/corregir/borrar una sesión de caja.')]},
  {bullet:1,parts:[t('Anular una venta de tienda o editar sus líneas.')]},
  {bullet:1,parts:[t('Las facturas de proveedor.')]},
  {bullet:1,parts:[t('Ver los informes de ventas.')]},
]})
box({fill:AMBER_BG,border:AMBER_BD,title:'Truco importante para el Sastre',items:[
  {parts:[t('Puedes BORRAR un cobro de un pedido, pero no editarlo (cambiar importe o método) — eso lo reserva el sistema al Administrador. Así que si te equivocas al registrar un cobro, la solución es sencilla: bórralo y vuelve a crearlo bien.')]},
]})

// ════════ 3. VENDEDOR ════════
H1('3. Vendedor')
para([t('El Vendedor atiende el mostrador: vende, cobra, hace devoluciones y maneja la caja. Hay dos niveles, Básico y Avanzado; lo común se explica primero y al final lo que el Avanzado hace de más.')])
H2('Abrir la caja')
para([t('Al entrar en el '),nav('TPV / Caja'),t(' sin caja abierta, la plataforma te pide abrirla: cuenta el efectivo del cajón, escribe el "Fondo inicial en caja" y pulsa "Abrir caja".')])
H2('Hacer una venta y cobrar')
listBlock([
  'Busca el producto (escribiendo o escaneando el código) y se añade al ticket. Puedes añadir una línea manual con "Línea -".',
  'Cuando tengas todo, pulsa el botón grande "PAGAR".',
  'Elige el vendedor si hace falta, y luego la forma de cobro.',
],{ordered:true})
para([t('Tienes tres formas de cobrar:')])
listBlock([
  [b('Íntegro'),t(' — todo con un método: pulsa "Efectivo", "Tarjeta", "Bizum" o "Transferencia" y luego "Pagar". También puedes pagar con vale/tarjeta regalo.')],
  [b('Mixto'),t(' — repartido entre varios métodos: vas sumando "+Efectivo", "+Tarjeta", etc., hasta el total, y pulsas "Completar venta".')],
  [b('Parcial (a plazos)'),t(' — cobras una parte ahora: pon el "Importe a cobrar ahora", elige el método, marca "Dejar resto como cobro pendiente", indica la fecha del próximo cobro y pulsa "Registrar cobro parcial".')],
])
para([t('Al terminar puedes imprimir el ticket, imprimir el ticket regalo, descargarlo en PDF, emitir factura o empezar una "Nueva venta".')])
H2('Hacer una devolución')
para([t('Desde el TPV pulsa "Devolver" (te lleva a la pantalla de devoluciones).')])
listBlock([
  'Busca el ticket original por su número o escaneando el código.',
  'Marca los artículos que se devuelven.',
  'Elige el tipo: "Vale de compra" (válido un año) o "Cambio directo" (por otro artículo).',
  'Si es cambio directo, busca el artículo nuevo; la pantalla indica si hay "Diferencia a cobrar" o "Saldo a favor del cliente".',
  'Escribe el motivo y pulsa "Generar vale de devolución" o "Procesar cambio".',
],{ordered:true})
H2('Cerrar la caja (arqueo)')
para([t('Al final del turno, en el TPV pulsa para cerrar caja. Verás el "Cierre de caja" con el desglose por método (Efectivo, Tarjeta, Bizum, Transferencia, Vales), el efectivo esperado y el contado, y la diferencia. Cuenta el efectivo real, escríbelo y pulsa "Cerrar caja".')])
H2('Lo que hace de más el Vendedor Avanzado')
listBlock([
  'Crear y editar pedidos de confección (el Básico no).',
  'Borrar pedidos.',
  'Editar el precio de los productos.',
  'Gestionar las facturas de venta.',
  'Aprobar traspasos de stock entre tiendas.',
])
box({fill:ADMIN_BG,border:ADMIN_BD,title:'Esto lo hace el Administrador',items:[
  {parts:[t('Ningún Vendedor (ni Básico ni Avanzado) hace esto:')]},
  {bullet:1,parts:[t('Ajustes manuales de caja (meter gastos/ingresos sueltos).')]},
  {bullet:1,parts:[t('Anular una devolución.')]},
  {bullet:1,parts:[t('Editar o borrar un cobro de una venta.')]},
  {bullet:1,parts:[t('Editar o borrar una retirada de caja, y reabrir/corregir/borrar una sesión de caja.')]},
  {bullet:1,parts:[t('Anular una venta de tienda o editar sus líneas.')]},
  {bullet:1,parts:[t('Las facturas de proveedor.')]},
  {bullet:1,parts:[t('Ver los informes de ventas.')]},
]})

// ════════ TABLA ════════
H1('¿Quién puede qué? — Tabla rápida')
para([t('Resumen de las tareas más habituales. "Sí" = puede hacerlo; "—" = no (lo hace quien tenga el "Sí").')])
const rows=[
  ['Vender en el TPV y cobrar','si','si','si'],
  ['Cobrar a plazos / parcial','si','si','si'],
  ['Hacer una devolución (vale o cambio)','si','si','si'],
  ['Abrir y cerrar la caja (arqueo)','si','si','si'],
  ['Crear y editar clientes','si','si','si'],
  ['Crear / editar pedidos de confección','si','si','av'],
  ['Cobrar un pedido de confección','si','si','no'],
  ['Cambiar estado / cancelar un pedido','si','si','av'],
  ['Borrar un pedido por completo','si','no','av'],
  ['Renumerar / cambiar de tienda un pedido','si','si','no'],
  ['Borrar un cobro','si','si','no'],
  ['Editar un cobro (importe / método)','si','no','no'],
  ['Corregir la caja a mano (gasto/ingreso)','si','no','no'],
  ['Editar / borrar una retirada de caja','si','no','no'],
  ['Reabrir / corregir / borrar una sesión de caja','si','no','no'],
  ['Anular una venta / editar sus líneas','si','no','no'],
  ['Anular una devolución','si','no','no'],
  ['Limpiar movimientos de stock huérfanos','si','no','no'],
  ['Desactivar / reactivar un cliente','si','no','no'],
  ['Facturas de proveedor (registrar / pagar)','si','no','no'],
  ['Ver los informes de ventas','si','no','no'],
]
const colX=[M, M+300, M+300+66, M+300+66+66], colW=[300,66,66,CW-300-66-66]
const cell=(txt,x,w,y,{header=false,val=null}={})=>{
  if(val==='si'){doc.font(FB).fontSize(9).fillColor('#15803d').text('Sí',x,y+4,{width:w,align:'center'})}
  else if(val==='no'){doc.font(FB).fontSize(9).fillColor('#b91c1c').text('—',x,y+4,{width:w,align:'center'})}
  else if(val==='av'){doc.font(FN).fontSize(7.5).fillColor(NAVY).text('Solo Avanz.',x,y+4.5,{width:w,align:'center'})}
  else {doc.font(header?FB:FN).fontSize(header?9:9).fillColor(header?'#ffffff':INK).text(txt,x+(header&&txt!=='Tarea'?0:6),y+4,{width:w-8,align:header&&txt!=='Tarea'?'center':'left'})}
}
// header
let y=doc.y+4
doc.save(); doc.rect(M,y,CW,20).fill(NAVY); doc.restore()
cell('Tarea',colX[0],colW[0],y,{header:true}); cell('Admin',colX[1],colW[1],y,{header:true}); cell('Sastre',colX[2],colW[2],y,{header:true}); cell('Vendedor',colX[3],colW[3],y,{header:true})
y+=20
doc.font(FN).fontSize(9)
for(let i=0;i<rows.length;i++){
  const rh=18
  if(y+rh>maxY()){ doc.addPage(); y=M; doc.save(); doc.rect(M,y,CW,20).fill(NAVY); doc.restore(); cell('Tarea',colX[0],colW[0],y,{header:true}); cell('Admin',colX[1],colW[1],y,{header:true}); cell('Sastre',colX[2],colW[2],y,{header:true}); cell('Vendedor',colX[3],colW[3],y,{header:true}); y+=20 }
  if(i%2){ doc.save(); doc.rect(M,y,CW,rh).fill('#f4f6f9'); doc.restore() }
  cell(rows[i][0],colX[0],colW[0],y)
  cell(null,colX[1],colW[1],y,{val:rows[i][1]})
  cell(null,colX[2],colW[2],y,{val:rows[i][2]})
  cell(null,colX[3],colW[3],y,{val:rows[i][3]})
  doc.save(); doc.moveTo(M,y+rh).lineTo(M+CW,y+rh).lineWidth(0.5).strokeColor('#dde2ea').stroke(); doc.restore()
  y+=rh
}
doc.y=y+10
para([it('Nota: "Vendedor" agrupa Básico y Avanzado; donde difieren, se indica "Solo Avanz.". El Administrador puede hacer todo lo de la plataforma, también lo que no aparece en esta tabla.')],{size:9,color:MUTE})

// ════════ pies de página ════════
const range=doc.bufferedPageRange()
for(let i=0;i<range.count;i++){
  const pageNum=range.start+i
  if(i===0) continue // saltar la portada
  doc.switchToPage(pageNum)
  const oldBottom=doc.page.margins.bottom
  doc.page.margins.bottom=0 // evita que escribir en el margen inferior cree páginas nuevas
  doc.font(FN).fontSize(8).fillColor(MUTE)
  doc.text('Sastrería Prats · Guía de uso de la plataforma',M,PH-40,{lineBreak:false})
  doc.text(`${i}`,M,PH-40,{width:CW,align:'right',lineBreak:false})
  doc.page.margins.bottom=oldBottom
}

doc.end()
doc.on('end',()=>{}) // pdfkit no emite; el stream finish lo confirma
console.log('Generando…', out)
