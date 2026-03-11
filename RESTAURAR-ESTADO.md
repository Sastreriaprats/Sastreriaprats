# Punto de restauración - Estado plataforma (marzo 2026)

## Estado actual guardado (9 marzo 2026)

**Tag en Git:** `estado-plataforma-09marzo2026`  
**Commit:** `dda227a` (PDF factura según referencia, regenerar siempre PDF, migraciones, contabilidad/pagos)

Incluye: diseño PDF factura (cabecera blanco/azul, línea dorada, bloque empresa/cliente, tabla con cabecera #1a1a2e, totales, condiciones de pago, pie); `generateInvoicePdfAction` siempre regenera el PDF; migraciones 056-059; mejoras en contabilidad y pagos.

---

## Estado anterior (referencia)

**Tag en Git:** `estado-plataforma-marzo2026`  
**Commit:** `9702d84` (fix: errores TypeScript en build + funcionalidades POS)

## Cómo volver a un estado guardado

```bash
# Ver tags disponibles
git tag -l estado-plataforma*

# Volver al estado actual guardado (9 marzo 2026)
git fetch origin
git checkout estado-plataforma-09marzo2026

# O volver al estado anterior
git checkout estado-plataforma-marzo2026

# Ver el código de un tag sin cambiar de rama
git show estado-plataforma-09marzo2026 --stat
```

Si quieres que **main** vuelva a estar exactamente como en un tag:

```bash
git fetch origin
git checkout main
git reset --hard estado-plataforma-09marzo2026   # o estado-plataforma-marzo2026
git push origin main --force
```

*(Usa `--force` solo si estás seguro; reescribe el historial de main en el remoto.)*

## Qué incluye el estado actual (09marzo2026)

- **PDF factura:** Cabecera blanco/azul con logo, línea dorada, bloque Empresa/Cliente, tabla con cabecera oscura y filas alternas, totales destacados, condiciones de pago, pie con 3 líneas.
- **Contabilidad:** Generación de PDF de factura siempre regenera el archivo (no reutiliza URL antigua).
- **Migraciones:** 056-059 (líneas entregadas, RLS productos/confección, trigger total pagado, estado pedidos).
- Resto de mejoras en órdenes, pagos y POS según el historial de commits.

## Qué incluía el estado anterior (marzo2026)

- **POS (caja):** Vendedor obligatorio al cobrar (primer paso del diálogo), incluir pendientes del cliente en el ticket, cobro íntegro con selección de método + botón "Pagar", diálogo venta completada con vendedor y diseño ajustado.
- **Resumen de caja e históricos:** Columna "Vendedor" en ventas y tickets.
- **Correcciones de build:** TypeScript en accounting, products, accounting-content, product-form para que el deploy pase.

---

*Generado para poder recuperar el estado estable de la plataforma.*
