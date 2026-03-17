# Punto de restauración - Estado plataforma (marzo 2026)

## Estado actual guardado (17 marzo 2026)

**Tag en Git:** `estado-plataforma-17marzo2026`
**Commit:** `aa16ecd` (feat: bloqueo de cobros sin caja abierta + consolidación de roles + gate de sesión sastre)

Incluye: consolidación de roles (elimina `sastre`/`vendedor_basico`, migra a `sastre_plus`/`vendedor_avanzado`); bloqueo de cobros sin caja abierta en `addOrderPayment`, `addSalePayment`, `createFichaOrder`, `createSale`; `PaymentHistory` deshabilita botón de pago si no hay caja; `SastreSessionGate` (selección obligatoria de tienda + verificación de caja al entrar al panel sastre, con `sessionStorage` para forzar selección en cada sesión); sidebar sastre con "Pedidos" visible para todos los roles; mejoras UI en detalle de pedido sastre y `PaymentHistory` tema oscuro.

---

## Estado anterior (16 marzo 2026)

**Tag en Git:** `estado-plataforma-16marzo2026`
**Commit:** `aa16ecd` (mismo commit, tag anterior)

---

## Estado anterior (9 marzo 2026)

**Tag en Git:** `estado-plataforma-09marzo2026`
**Commit:** `dda227a` (PDF factura según referencia, regenerar siempre PDF, migraciones, contabilidad/pagos)

Incluye: diseño PDF factura (cabecera blanco/azul, línea dorada, bloque empresa/cliente, tabla con cabecera #1a1a2e, totales, condiciones de pago, pie); `generateInvoicePdfAction` siempre regenera el PDF; migraciones 056-059; mejoras en contabilidad y pagos.

---

## Estado anterior (marzo 2026)

**Tag en Git:** `estado-plataforma-marzo2026`
**Commit:** `9702d84` (fix: errores TypeScript en build + funcionalidades POS)

---

## Cómo volver a un estado guardado

```bash
# Ver tags disponibles
git tag -l estado-plataforma*

# Volver al estado actual guardado (17 marzo 2026)
git fetch origin
git checkout estado-plataforma-17marzo2026

# O volver a un estado anterior
git checkout estado-plataforma-16marzo2026
git checkout estado-plataforma-09marzo2026

# Ver el código de un tag sin cambiar de rama
git show estado-plataforma-16marzo2026 --stat
```

Si quieres que **main** vuelva a estar exactamente como en un tag:

```bash
git fetch origin
git checkout main
git reset --hard estado-plataforma-17marzo2026
git push origin main --force
```

*(Usa `--force` solo si estás seguro; reescribe el historial de main en el remoto.)*

## Qué incluye el estado actual (17marzo2026)

- **Roles consolidados:** `sastre` → `sastre_plus`, `vendedor_basico` → `vendedor_avanzado`. Migración SQL `067_consolidate_roles.sql`.
- **Bloqueo de cobros sin caja:** `addOrderPayment`, `addSalePayment`, `createFichaOrder` (si entrega > 0) y `createSale` bloquean si no hay caja abierta. `PaymentHistory` deshabilita el botón "Registrar pago" client-side.
- **SastreSessionGate:** Al entrar al panel sastre, obliga a seleccionar tienda (usando `sessionStorage` para forzarlo en cada sesión de navegador) y verifica que haya caja abierta antes de mostrar el contenido. Opción de continuar sin caja (modo consulta).
- **Sidebar sastre:** "Pedidos" visible para todos los roles sastre (no solo `sastre_plus`).
- **UI:** Mejoras visuales en detalle de pedido sastre y `PaymentHistory` con tema oscuro.
- **Migraciones:** 066 (permiso `orders.view` para sastre), 067 (consolidación de roles).

## Qué incluía el estado anterior (09marzo2026)

- **PDF factura:** Cabecera blanco/azul con logo, línea dorada, bloque Empresa/Cliente, tabla con cabecera oscura y filas alternas, totales destacados, condiciones de pago, pie con 3 líneas.
- **Contabilidad:** Generación de PDF de factura siempre regenera el archivo (no reutiliza URL antigua).
- **Migraciones:** 056-059 (líneas entregadas, RLS productos/confección, trigger total pagado, estado pedidos).
- Resto de mejoras en órdenes, pagos y POS según el historial de commits.

---

*Generado para poder recuperar el estado estable de la plataforma.*
