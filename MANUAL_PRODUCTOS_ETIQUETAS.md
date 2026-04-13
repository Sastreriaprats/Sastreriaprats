# Manual — Del producto a la etiqueta

Guía paso a paso del proceso completo en la plataforma.

## 1. Recepción de un pedido a proveedor

Cuando llega mercancía de un proveedor que habíais pedido:

1. Ir a **Proveedores** → seleccionar el proveedor
2. Abrir el pedido correspondiente (en la pestaña "Pedidos")
3. Pulsar "Registrar recepción"
4. Marcar las líneas recibidas:
   - Si todo ha llegado completo: botón "Marcar todo como recibido"
   - Si solo parte: editar la cantidad recibida de cada línea
   - Si hay incidencias: pulsar el icono de incidencia y describir el problema
5. Confirmar la recepción

El stock se actualiza automáticamente en el almacén correspondiente.

## 2. Crear un producto nuevo (si no existía)

Si el producto recibido no está en la plataforma:

1. Ir a **Stock → Productos → Nuevo producto**
2. Rellenar Información básica:
   - Nombre del producto
   - SKU: se genera automáticamente (PRATS-XXXXX)
   - Tipo: Boutique
   - Categoría
   - Marca, Colección, Temporada
   - Proveedor y referencia del proveedor
3. Rellenar Precios:
   - Precio de coste
   - PVP (con IVA)
4. Rellenar Variantes:
   - Seleccionar Plantilla de tallas según el tipo (Americanas, Zapatos UK, etc.)
   - Marcar las tallas que tiene este producto concreto
   - Almacén donde dar de alta el stock inicial
   - Indicar stock inicial por talla si procede
5. Guardar producto

## 3. Generar códigos de barras (EAN-13)

Los productos importados del Excel ya tienen sus EAN-13. Los productos creados nuevos NO tienen EAN hasta que se generan:

1. Ir a **Stock → Códigos de barras**
2. Si hay variantes sin código, aparecerá el botón "Generar códigos para variantes sin código (X)"
3. Pulsar el botón — se generarán automáticamente EAN-13 únicos para todas las variantes que falten

## 4. Imprimir etiquetas

1. Ir a **Stock → Códigos de barras**
2. Buscar el producto (por nombre, SKU o código)
3. Desplegar el producto para ver sus variantes
4. Marcar las casillas de las variantes que quieres imprimir
5. Pulsar "Imprimir etiquetas seleccionadas"
6. En el diálogo de impresión del navegador:
   - Destino: **Brother QL-700**
   - Si no aparece: pulsar "Ver más..."
   - Tamaño de papel: el predeterminado de la impresora (DK)
   - Márgenes: Ninguno
7. Pulsar Imprimir

**Cada etiqueta contiene:**
- Nombre del producto con la talla
- Código de barras EAN-13
- Código interno
- PVP con IVA

## 5. Usar las etiquetas en el TPV

1. Abrir el TPV (**TPV / Caja**)
2. Con el POS abierto, disparar la pistola sobre la etiqueta
3. El producto se añade automáticamente al carrito
4. Seguir cobrando con normalidad

## Preguntas frecuentes

**¿Por qué no se lee la etiqueta con la pistola?**
- Verifica que la impresora haya impreso con calidad (sin rayas, barras claras)
- Comprueba que el código tiene zonas blancas a los lados
- Si sigue sin leer, genera el código de nuevo desde "Códigos de barras"

**¿Qué pasa si me equivoco con la cantidad recibida del proveedor?**
- Puedes editar las líneas del pedido mientras no esté cerrado
- Si el pedido ya está marcado como recibido, contacta con administración

**¿Cómo reporto una incidencia con un pedido de proveedor?**
- En la línea concreta, pulsa el icono de incidencia
- Describe qué ha pasado (rotura, talla incorrecta, faltan unidades, etc.)
- La incidencia queda registrada en el pedido
