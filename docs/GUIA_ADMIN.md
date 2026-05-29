# Guía de administración — Sastrería Prats

> Manual para resolver tú mismo los errores del día a día, sin llamar a soporte.
> Pensado para Mónica e Ismael.

---

## 1. Introducción

### 1.1 Para qué sirve esta guía

La plataforma está hecha para que **tú puedas corregir casi cualquier error sin depender de nadie**: cobraste mal, hiciste una devolución equivocada, hay un cliente duplicado, metiste un ajuste de stock que no tocaba… casi todo tiene un botón para arreglarlo desde la pantalla.

Esta guía recoge esos casos, uno por uno, con: **qué problema resuelve**, **dónde está el botón**, **qué pasos seguir**, **qué verás al terminar** y **qué NO toca** ese botón (para que pierdas el miedo a usarlo).

### 1.2 Cómo usar la guía

Busca por tu problema en lenguaje normal ("cobré mal", "sobra una retirada", "hay dos fichas del mismo cliente"), no por el nombre del menú. Cada apartado empieza con la frase del problema tal y como lo dirías en voz alta.

### 1.3 Cuándo sí conviene llamarnos

Hay tres situaciones que todavía **no** se resuelven solas desde la pantalla. Están al final de la guía (apartado 10). Si te topas con una de ellas, llámanos sin agobiarte.

### 1.4 Dos ideas que se repiten en todo el manual

- **Si algo no cuadra, el sistema te avisa.** Cuando una acción no se puede hacer, sale un mensaje en rojo explicando por qué. **Léelo**: casi siempre te dice exactamente qué pasa.
- **Todo queda registrado.** Cada cambio guarda quién lo hizo y cuándo. No hay forma de "romper" algo sin dejar rastro, así que puedes trabajar con tranquilidad.

---

## 2. Problemas con tickets (ventas de tienda)

Todo esto se hace desde la pantalla **Tickets**. Busca el ticket en la lista; a la derecha de cada uno tienes los botones **Editar**, **Pagos**, **Líneas** y **Eliminar**.

### 2.a) "El cliente del ticket está mal"

**Dónde:** Tickets → botón **Editar** (icono de lápiz) en la fila del ticket.

**Pasos:**
1. Pulsa **Editar**. Se abre la ventana *"Editar ticket [número]"*.
2. En **Cliente**, usa el buscador (*"Buscar otro cliente (nombre o código)…"*) y elige el cliente correcto.
3. Pulsa **Guardar cambios**.

**Qué verás al final:** el ticket queda asignado al cliente correcto. Sale el aviso *"Venta actualizada"*.

**Ten en cuenta:**
- Si esa venta ya tiene **factura**, también se actualizan los datos del cliente en la factura.
- Si la factura ya se envió a Hacienda, **no** se puede cambiar el cliente (el sistema te lo impedirá).

**Lo que NO toca este botón:** no cambia productos, ni importes, ni el stock, ni la caja. Solo el cliente y las notas.

### 2.b) "El método de pago está mal (marqué tarjeta y fue efectivo)"

**Dónde:** Tickets → botón **Pagos** (icono de tarjeta).

**Pasos:**
1. Pulsa **Pagos**. Se abre *"Editar pagos · [número]"*.
2. Verás una o varias filas con **método** (Efectivo, Tarjeta, Bizum, Transferencia) e **importe**. Corrige el método y/o el importe.
3. Puedes **+ Añadir pago** si la venta se pagó en dos formas (por ejemplo, mitad tarjeta y mitad efectivo), o quitar filas con la **X**.
4. Mira el indicador de abajo: tiene que poner **"Cuadra"** (en verde). Si pone *"Faltan…"* o *"Sobran…"* (en rojo), ajusta hasta que cuadre.
5. Pulsa **Guardar pagos**.

**Qué verás al final:** la caja de ese día se ajusta sola al nuevo reparto por método.

**Ten en cuenta:**
- El botón **Guardar pagos** está bloqueado hasta que el reparto **cuadre**.
- El indicador compara con lo realmente **cobrado** (que puede ser menor que el total si la venta tenía un saldo pendiente).

**Lo que NO toca este botón:** no cambia el total de la venta, ni los productos, ni el stock. Solo ajusta **cómo** se cobró.

### 2.c) "El producto, la cantidad o el precio del ticket está mal"

**Dónde:** Tickets → botón **Líneas** (icono de caja).

**Pasos:**
1. Pulsa **Líneas**. Se abre *"Editar líneas · [número]"*.
2. Corrige cada línea: **descripción**, **cantidad**, **precio**. Puedes buscar un producto para añadirlo, usar **+ Añadir línea libre**, o aplicar un **Descuento global %**.
3. Abajo verás el **Total nuevo** y lo ya **Cobrado**. Si queda diferencia, el sistema te avisa de que *"quedará un saldo pendiente"* o *"un saldo a favor del cliente"*.
4. Para confirmar, **escribe el número del ticket** en el recuadro que aparece (es una protección contra clics accidentales).
5. Pulsa **Guardar líneas**.

**Qué verás al final:** se recalculan el total, el stock de los productos afectados y la contabilidad.

**Ten en cuenta:**
- Es una acción de **administrador**. Si no ves el botón o no te deja, es por permisos.
- Cada línea necesita una cantidad de al menos 1 y un precio válido.

**Lo que NO toca este botón:** no toca los **pagos** ya registrados (si cambia el total, te quedará un saldo pendiente o a favor que gestionas aparte).

### 2.d) "Las notas del ticket están mal o falta información"

**Dónde:** Tickets → botón **Editar** (el mismo de 2.a).

**Pasos:** en la ventana *"Editar ticket"*, escribe en el campo **Notas** y pulsa **Guardar cambios**.

**Lo que NO toca este botón:** igual que en 2.a, solo cliente y notas.

### 2.e) "Hay que anular un ticket entero"

**Dónde:** Tickets → botón **Eliminar** (rojo, icono de papelera).

**Pasos:**
1. Pulsa **Eliminar**. Se abre *"Eliminar ticket [número]"* con el aviso de que es un *"borrado físico total e irreversible: venta, líneas, pagos, stock, caja y contabilidad"*.
2. El sistema calcula y te muestra un **resumen** antes de nada:
   - En **rojo** ("No se puede eliminar"): motivos que **bloquean** el borrado, si los hay.
   - En **ámbar**: avisos a tener en cuenta.
   - En **azul** ("Al eliminar también:"): lo que se deshará automáticamente (devolución de stock, asientos, etc.).
   - Si la venta tenía **retiradas** asociadas en esa caja, te deja marcar con casillas cuáles borrar también.
3. Para confirmar, **escribe el número del ticket** en el recuadro.
4. Pulsa **Eliminar definitivamente**.

**Qué verás al final:** el ticket desaparece y todo lo que arrastraba (stock, caja, contabilidad) vuelve a su sitio.

**Ten en cuenta (casos especiales que verás en el resumen):**
- **Vales / tarjetas regalo:** si el ticket generó un vale y sigue intacto (sin canjear), el sistema lo cancela solo. Si el vale ya se usó total o parcialmente, el sistema bloquea: habría que ir antes a la ficha del vale (apartado 5) para gestionarlo.
- **Devoluciones:** si el ticket tiene una devolución asociada, aparecerá como aviso o bloqueo.
- **Factura enviada a Hacienda:** bloquea el borrado. Lo verás en rojo.
- Es una acción de **administrador**.

**Lo que NO toca este botón:** nada queda "a medias". O se borra todo de forma coherente, o el sistema te frena antes con un motivo.

---

## 3. Problemas con la caja

Todo esto está en **Contabilidad → pestaña "Resúmenes de Caja"**. Ahí ves la lista de **sesiones de caja**; pincha en una para abrir su detalle (*"Caja del [fecha]"*), con sus movimientos y su cierre.

> **Importante sobre los descuadres (lee esto):** al **cerrar la caja desde el TPV**, el sistema exige que el efectivo cuadre **al céntimo**. Eso **no** significa que tengas que "inventar" la cifra para que cuadre. La forma correcta es: **cierra la caja con lo que el sistema espera y, si el dinero real no coincide, corrige el arqueo después desde Contabilidad** (apartado 3.f). Así queda **constancia del descuadre real** en lugar de esconderlo. Nunca falsees el conteo solo para poder cerrar.

### 3.a) "Metí mal una retirada (importe o motivo)"

**Dónde:** Contabilidad → Resúmenes de Caja → abre la sesión → en la lista de **Movimientos**, busca la retirada y pulsa el **lápiz** (*Editar retirada*).

**Pasos:**
1. Pulsa el lápiz de esa retirada. Se abre *"Editar retirada de caja"*.
2. Corrige el **Importe (€)** y/o el **Motivo**.
3. Pulsa **Guardar**.

**Qué verás al final:** la retirada queda corregida. Si la sesión ya estaba cerrada, el aviso te recuerda que *"se recalculará el efectivo esperado y el descuadre"*.

**Ten en cuenta:** es una acción de **administrador**.

**Lo que NO toca este botón:** no toca las ventas ni los cobros de esa caja, solo esa retirada concreta.

### 3.b) "Una retirada está de más, hay que quitarla"

**Dónde:** igual que 3.a, pero pulsa la **papelera** (*Borrar retirada*).

**Pasos:**
1. Pulsa la papelera. Sale *"¿Borrar esta retirada?"*.
2. El aviso te dice que *"se eliminará la retirada de [importe] y se ajustará el arqueo de la sesión"*.
3. Pulsa **Borrar**.

**Qué verás al final:** la retirada desaparece y el efectivo esperado de la caja se recalcula solo.

**Lo que NO toca este botón:** solo esa retirada; el resto de la caja se mantiene.

### 3.c) "Cerré la caja mal contada o con el efectivo equivocado"

**Dónde:** Contabilidad → Resúmenes de Caja → abre la sesión (cerrada) → botón **Editar arqueo** (lápiz).

**Pasos:**
1. Pulsa **Editar arqueo**. Se abre *"Editar arqueo de caja"*.
2. Corrige el **Fondo inicial (€)** y/o el **Efectivo contado (€)**. Puedes añadir una nota de cierre.
3. El recuadro te muestra en tiempo real el efectivo **esperado** y el **descuadre** que quedará.
4. Pulsa **Guardar**.

**Qué verás al final:** sale *"Arqueo corregido"* y el cierre de la caja se actualiza con los nuevos números.

**Ten en cuenta:** es una acción de **administrador**. Solo aparece en sesiones **cerradas**.

**Lo que NO toca este botón:** no cambia las ventas ni los cobros; solo el conteo de efectivo (fondo y contado) y, a partir de ahí, el descuadre.

> **Nota:** este mismo botón (**Editar arqueo**) sirve también para registrar un descuadre real entre el dinero esperado y el contado. Mira el apartado 3.f si ese es tu caso.

### 3.d) "Cerré la caja por error, hay que reabrirla"

**Dónde:** Contabilidad → Resúmenes de Caja → abre la sesión (cerrada) → botón **Reabrir** (icono de candado).

**Pasos:**
1. Pulsa **Reabrir**. Sale *"¿Reabrir esta sesión de caja?"*.
2. El aviso explica que, mientras esté abierta, los nuevos pagos y retiradas de esa tienda se atribuirán a esta sesión.
3. Pulsa **Reabrir**.

**Ten en cuenta:**
- **Solo puede haber una caja abierta por tienda.** Si la tienda ya tiene otra caja abierta, el sistema **no** te dejará reabrir esta: ciérrala primero.
- Es una acción de **administrador**.

**Lo que NO toca este botón:** no borra ni cambia los movimientos que ya tenía la sesión; solo la vuelve a poner "en curso".

### 3.e) "Hay una sesión de prueba o vacía que hay que borrar"

**Dónde:** Contabilidad → Resúmenes de Caja → abre la sesión (cerrada y **vacía**) → botón **Borrar sesión** (rojo).

**Pasos:**
1. Pulsa **Borrar sesión**. Sale *"¿Borrar esta sesión de caja?"*.
2. El aviso recuerda que *"solo se permite si está vacía (sin ventas ni retiradas)"*.
3. Pulsa **Borrar**.

**Ten en cuenta:**
- El botón **solo aparece si la sesión está vacía**. Si tiene ventas o retiradas, no podrás borrarla (primero hay que deshacer esos movimientos).
- Es una acción de **administrador**.

**Lo que NO toca este botón:** no afecta a otras sesiones ni a la contabilidad general; solo elimina esa caja vacía.

### 3.f) "Quiero dejar registrado un descuadre real de caja"

Este es el caso correcto cuando **el dinero contado no coincide con lo esperado** y quieres que quede reflejado (no esconderlo).

**Dónde:** Contabilidad → Resúmenes de Caja → abre la sesión → **Editar arqueo** (igual que 3.c).

**Pasos:**
1. En **Efectivo contado (€)**, pon **el dinero que realmente hay**, aunque no cuadre.
2. El recuadro mostrará el **descuadre** (diferencia entre lo esperado y lo contado).
3. Pulsa **Guardar**.

**Qué verás al final:** la caja queda cerrada con su **descuadre real registrado** (verás la diferencia marcada). Eso es lo que queremos: la verdad, no un número maquillado.

**La regla mental:** *nunca falsees el conteo al cerrar solo para que cuadre.* Cierra con normalidad y, si hay diferencia, déjala registrada aquí.

---

## 4. Problemas con clientes

### 4.a) "Los datos del cliente están mal"

**Dónde:** Clientes → abre la ficha del cliente → pestaña **Datos**.

**Pasos:** corrige los campos (nombre, teléfono, email, dirección, etc.) y pulsa **Guardar cambios**. Sale *"Datos actualizados"*.

**Lo que NO toca este botón:** solo los datos de la ficha; no toca sus ventas, pedidos ni vales.

### 4.b) "Hay dos fichas del mismo cliente, hay que fusionarlas"

**Dónde:** Clientes → abre la ficha que quieres **eliminar** (la que sobra) → botón **Fusionar con…** (arriba).

**Pasos:**
1. Pulsa **Fusionar con…**. Se abre *"Fusionar cliente"*.
2. Arriba verás el aviso: *"[Nombre] será absorbido y eliminado. Todo lo suyo pasará al cliente que elijas."* (es decir, **la ficha desde la que entraste es la que desaparece**).
3. Busca y selecciona el **cliente que se queda** (el superviviente).
4. El sistema te muestra **qué se va a reasignar** (ventas, pedidos, vales, citas… con sus cantidades).
5. Si quieres, deja marcada la casilla **"Completar campos vacíos del destino con datos del cliente actual"** (ver 4.c).
6. Para confirmar, **escribe el nombre completo del cliente que se va a absorber**.
7. Pulsa **Fusionar definitivamente**.

**Qué verás al final:** te lleva a la ficha del cliente que se queda, con todo el historial unido. La duplicada desaparece. Sale *"Clientes fusionados"*.

**Ten en cuenta:**
- ⚠️ **Es la única acción de todo el manual que NO se puede deshacer.** Por eso te obliga a escribir el nombre. (Ver apartado 9.)
- Es una acción de **administrador**.
- Si algo impide la fusión, sale en rojo y no te deja continuar.

**Lo que NO toca este botón:** con la casilla de "completar campos vacíos" marcada, **no pisa** los datos que el cliente bueno ya tenga; solo rellena los huecos.

### 4.c) "Faltan datos que sí tiene la ficha duplicada"

Es el mismo proceso de 4.b. La clave es la casilla **"Completar campos vacíos del destino con datos del cliente actual"**: al fusionar, los huecos del cliente que se queda se rellenan con lo que tuviera el que se borra (sin sobrescribir lo que ya estaba relleno).

---

## 5. Problemas con devoluciones y vales

Los vales se gestionan desde **Vales** (pantalla *Tickets → Vales*, o el acceso directo a Vales). **Abre el vale** para entrar en su ficha: ahí están **todos** los botones (Ajustar saldo, Reactivar, Anular, Editar caducidad, Editar notas, Reasignar cliente) y el **Historial de canjes**.

### 5.a) "El vale generado está mal de importe"

**Dónde:** Vales → abre el vale → botón **Ajustar saldo**.

**Pasos:**
1. Pulsa **Ajustar saldo**. Se abre *"Ajustar saldo del vale"* (te muestra el saldo actual y el original).
2. Escribe el **Nuevo saldo (€)**.
3. Escribe el **Motivo** (obligatorio, **mínimo 10 caracteres**). Ejemplo: *"corrección de devolución TICK-XXXX que se calculó mal"*.
4. Pulsa **Aplicar ajuste**. Sale *"Saldo ajustado"*.

**Ten en cuenta:**
- Si pones un saldo **mayor que el original**, el sistema avisa en ámbar (sube también el importe original).
- Si **aumentas** el saldo, avisa de que estás regalando crédito: asegúrate de tener la justificación clara (por eso el motivo es obligatorio).
- Es una acción de **administrador**.
- Este ajuste solo cambia el saldo del vale; **no genera un asiento contable nuevo**. La diferencia se reflejará en contabilidad cuando el cliente canjee el vale.

**Lo que NO toca este botón:** no afecta a otros vales ni a la caja; solo el saldo de este vale.

### 5.b) "Anulé un vale por error"

**Dónde:** Vales → abre el vale (anulado) → botón **Reactivar**.

**Pasos:**
1. Pulsa **Reactivar**. Sale *"¿Reactivar este vale?"*.
2. Pulsa **Reactivar**. Sale *"Vale reactivado"*.

**Ten en cuenta:** si el vale está **caducado por fecha**, el aviso te lo recuerda: no será canjeable hasta que le cambies la caducidad (ver 5.e).

**Lo que NO toca este botón:** recupera el vale tal cual estaba; no cambia su saldo ni su caducidad.

### 5.c) "Quiero saber dónde se gastó un vale"

**Dónde:** Vales → abre el vale → tarjeta **Historial de canjes**.

**Qué verás:** la lista de tickets donde se usó, con fecha, importe canjeado y tienda. Si no se ha usado, lo indica. Arriba también ves el saldo restante, el origen del vale y, si los hay, el **vale padre** y los **vales residuales** enlazados.

### 5.d) "Quiero cambiar el cliente asignado a un vale"

**Dónde:** Vales → abre el vale → botón **Reasignar cliente**.

**Pasos:**
1. Pulsa **Reasignar cliente**. Te muestra el cliente actual.
2. Busca el nuevo cliente (por nombre, email o teléfono) y selecciónalo. Sale *"Cliente reasignado"*.
3. Si lo que quieres es **dejarlo sin cliente**, usa el botón **Quitar cliente**.

**Lo que NO toca este botón:** solo cambia a quién pertenece el vale; el saldo y la caducidad se mantienen.

### 5.e) "El vale caducó pero hay que reactivarlo / ampliarlo"

**Dónde:** Vales → abre el vale → botón **Editar caducidad**.

**Pasos:** elige la **nueva fecha de caducidad** y pulsa **Guardar**. Sale *"Caducidad actualizada"*.

> Si el vale estaba caducado, suele hacer falta combinar esto con **Reactivar** (5.b): primero reactívalo, luego amplía la fecha.

**Lo que NO toca este botón:** solo la fecha límite; el saldo no cambia.

### 5.f) "Quiero revisar todas las devoluciones"

**Dónde:** pantalla **Devoluciones**.

**Qué verás:** el listado de devoluciones con filtros por **texto** (ticket, cliente o motivo), **tipo** (Vale / Cambio), **estado del vale** (Activo / Usado parcial / Usado / Cancelado), **tienda** y **rango de fechas**. Cada fila muestra fecha, ticket, cliente, tipo, importe, estado del vale, vendedor y tienda. Pincha una para ver su detalle.

### 5.g) "Hay que anular un vale"

**Dónde:** Vales → abre el vale → botón **Anular** (rojo).

**Pasos:**
1. Pulsa **Anular**. Sale *"¿Anular este vale?"* (indica el saldo que quedará anulado).
2. Puedes escribir un **motivo** (opcional).
3. Pulsa **Anular**. Sale *"Vale anulado"*.

**Ten en cuenta:** un vale ya **anulado se puede reactivar** después (5.b), así que no es un paso sin retorno.

---

## 6. Problemas con stock

### 6.a) "Hice un ajuste de inventario equivocado"

**Dónde:** Stock → pestaña **Movimientos**.

**Pasos:**
1. Localiza el movimiento equivocado (puedes filtrar por **Tipo de movimiento**: *Ajuste +* o *Ajuste −*).
2. En su fila, pulsa **Revertir**.
3. Se abre *"¿Revertir este ajuste de stock?"*. Te muestra el cálculo: **Stock actual → resultante**.
4. Pulsa **Revertir**. Sale *"Movimiento revertido"*.

**Qué verás al final:** se crea un movimiento de signo contrario (queda marcado como *reversión*), el original queda marcado como *revertido*, y el stock vuelve a su valor correcto.

**Ten en cuenta:**
- Solo se pueden revertir **ajustes manuales** (no ventas, compras ni traspasos: esos se deshacen desde su propia operación).
- Si al revertir **el stock quedaría negativo**, el sistema **no te deja** y avisa en rojo: significa que esas unidades ya se movieron (se vendieron o trasladaron). En ese caso hay que hacer un ajuste manual con el motivo concreto (ver apartado 10).
- Es una acción de **administrador**.

**Lo que NO toca este botón:** no borra el movimiento original (queda como histórico); crea uno nuevo que lo compensa.

### 6.b) "Quiero ver el histórico de movimientos de un producto"

**Dónde:** Stock → pestaña **Movimientos**.

**Qué verás:** la tabla de todos los movimientos (fecha, tipo, producto, almacén, cantidad, stock antes/después, motivo y usuario). Filtra por **Tipo de movimiento** para acotar.

---

## 7. Problemas con cobros de pedidos (sastrería)

Los pedidos de sastrería tienen sus propios cobros (señales y pagos a cuenta). Se gestionan desde la ficha del pedido.

### 7.a) "Cobré mal un pago de un pedido (importe o método)"

**Dónde:** Pedidos → abre el pedido → pestaña **Pagos** → tabla **Historial de pagos**.

**Pasos:**
1. En la fila del pago equivocado, pulsa el **lápiz** (*Editar cobro*).
2. Se abre *"Editar cobro"*. Cambia el **Método de pago** y/o el **Importe**.
3. Pulsa **Guardar cambios**.

**Qué verás al final:** la fila se actualiza y el total cobrado del pedido se recalcula solo.

**Ten en cuenta:**
- Si el cobro pertenecía a una **caja ya cerrada**, el sistema ajusta sus totales y **recalcula el arqueo automáticamente** (la propia ventana te lo recuerda).
- Es una acción de **administrador**.

**Lo que NO toca este botón:** solo importe y método. La fecha, el pedido y la caja a la que pertenece no se tocan aquí.

### 7.b) "Hay que quitar un cobro de un pedido"

**Dónde:** Pedidos → abre el pedido → pestaña **Pagos** → tabla **Historial de pagos** → **papelera** en la fila del cobro.

**Pasos:**
1. Pulsa la papelera. Sale *"¿Eliminar pago?"*, con el aviso de que *"se revertirán sus efectos en caja (totales y, si la sesión está cerrada, el arqueo)"*.
2. Confirma con **Sí, eliminar pago**.

**Qué verás al final:** el cobro desaparece, la caja revierte y el total cobrado del pedido baja.

**Lo que NO toca este botón:** solo ese cobro; el resto del pedido (prendas, pruebas, etc.) sigue igual.

---

## 8. Problemas con contabilidad

Todo en **Contabilidad**. Arriba tienes las pestañas: **Resumen**, **Facturas**, **Presupuestos**, **Movimientos**, **Asientos**, **IVA Trimestral** y **Resúmenes de Caja**.

### 8.a) "Hay que registrar un gasto o un asiento manual"

**Dónde:** Contabilidad → pestaña **Asientos** → botón **Nuevo asiento**.

**Pasos:**
1. Pulsa **Nuevo asiento**. Se abre la pantalla *"Nuevo asiento manual"*.
2. Rellena la **Fecha** y la **Descripción** (ej: *"Gasto suelto de mensajería octubre"*).
3. Añade las **líneas**: elige la **Cuenta**, un **Concepto** (opcional) y el importe en **Debe** o en **Haber**. Hacen falta al menos **2 líneas**. Usa **Añadir línea** para más.
4. Abajo verás **Total Debe**, **Total Haber** y un indicador: tiene que poner **"✓ Cuadrado"** (verde). Si pone *"Descuadre: …"* (rojo), corrige hasta que el Debe y el Haber sean iguales.
5. Pulsa **Crear asiento**. Sale *"Asiento creado"*.

**Ten en cuenta:** el botón **Crear asiento** está bloqueado hasta que el asiento **cuadre** (Debe = Haber), todas las líneas tengan cuenta y haya descripción.

**Lo que NO toca este botón:** solo crea un apunte contable nuevo; no afecta a ventas, caja ni stock.

### 8.b) "Quiero ver, editar o anular un asiento manual ya creado"

**Dónde:** Contabilidad → pestaña **Asientos**. Pincha un asiento para desplegar sus líneas.

Según el tipo de asiento verás distintos botones:

- **Editar la descripción** (lápiz): disponible en cualquier asiento. Cambia solo el texto. Sale *"Descripción actualizada"*.
- **Editar asiento** (icono de libro) y **Anular asiento** (papelera roja): **solo en los asientos manuales que tú creaste** y que no estén en un periodo cerrado.
  - **Editar asiento** abre la misma pantalla del formulario (*"Editar asiento #[número]"*) para cambiar líneas e importes; al terminar, **Guardar cambios**.
  - **Anular asiento** pide confirmación: *"¿Anular este asiento? Vas a anular el asiento #[número]… Esta acción es irreversible."* → **Anular**. Sale *"Asiento anulado"*.

**Ten en cuenta (importante):**
- Los **asientos automáticos** (los que genera el sistema con ventas y pagos) **no se pueden editar ni anular** desde aquí: solo puedes cambiarles la descripción. Si algo está mal en uno de esos, lo que hay que corregir es la **venta o el cobro de origen** (apartados 2 y 7), no el asiento.
- "Anular" crea la corrección contable correspondiente; no borra el rastro.

### 8.c) "Quiero ver todos los movimientos del libro"

**Dónde:** Contabilidad → pestaña **Asientos** (el libro de apuntes contables) o pestaña **Movimientos** (entradas y salidas de dinero). Puedes filtrar por **periodo** (año/mes, "Este mes", "Mes pasado", "Todo el año") y descargar a Excel.

---

## 9. Cosas que conviene saber (vale para todo)

- **Tocar una caja ya cerrada no es peligroso.** Cuando editas un cobro, una retirada o el arqueo de una sesión cerrada, el sistema **recalcula solo** el efectivo esperado y el descuadre. No tienes que cuadrar nada a mano.
- **Lo único que bloquea siempre: las facturas enviadas a Hacienda.** Una factura ya emitida a Hacienda no se puede modificar ni permite cambiar el cliente; para corregirla se hace una factura rectificativa. (Cuando se active la facturación electrónica obligatoria, este bloqueo será aún más estricto.)
- **Si algo no se puede hacer, el sistema te lo dice.** Antes de bloquear, casi siempre te muestra el motivo en rojo. Léelo con calma: te ahorra la llamada.
- **Todo queda registrado.** Cada edición y cada borrado guardan quién y cuándo. Trabaja con tranquilidad.
- ⚠️ **La fusión de clientes (4.b) es la ÚNICA acción de todo el manual que no se puede deshacer.** Recomendación: antes de pulsar **Fusionar definitivamente**, **confírmalo en voz alta con otra persona** ("voy a fusionar a *Fulano* dentro de *Mengano*, ¿correcto?"). No es un bloqueo del sistema, es una buena costumbre para no fusionar a quien no toca.

---

## 10. Casos que todavía requieren ayuda (te lo decimos con franqueza)

Estos tres casos aún **no** se resuelven solos desde la pantalla. Si te topas con ellos, llámanos:

- **Cambiar la tienda de un ticket.** Es poco frecuente y toca muchas piezas a la vez (stock, caja, almacenes). De momento, la forma de hacerlo es **borrar el ticket y volver a crearlo en la tienda correcta**. Si te pasa a menudo, dínoslo y lo automatizamos.
- **Deshacer un cambio (devolución tipo "exchange").** Si una devolución se hizo como **cambio por otro artículo**, ahora mismo no hay botón para revertirla automáticamente. Llámanos para resolverlo a mano.
- **Cuando el sistema dice "el stock quedaría negativo".** No es un error de la plataforma: significa que las unidades **ya se movieron** (se vendieron o trasladaron). Antes de llamarnos, **investiga en Stock → Movimientos** qué pasó con esas unidades. Si tras revisar sigue sin cuadrar, llámanos.

---

*Guía viva: si encuentras un caso que no está aquí o un botón que no se comporta como dice esta guía, avísanos y la actualizamos.*
