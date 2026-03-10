# Punto de restauración - Estado plataforma (marzo 2026)

**Tag en Git:** `estado-plataforma-marzo2026`  
**Commit:** `9702d84` (fix: errores TypeScript en build + funcionalidades POS)

## Cómo volver a este estado si algo se pierde o se sobrescribe

```bash
# Ver el tag
git tag -l estado-plataforma-marzo2026

# Volver al estado guardado (descarta cambios locales)
git fetch origin
git checkout estado-plataforma-marzo2026

# O solo ver el código de ese momento sin cambiar de rama
git show estado-plataforma-marzo2026 --stat
```

Si quieres que **main** vuelva a estar exactamente como en este tag:

```bash
git fetch origin
git checkout main
git reset --hard estado-plataforma-marzo2026
git push origin main --force
```

*(Usa `--force` solo si estás seguro; reescribe el historial de main en el remoto.)*

## Qué incluye este estado

- **POS (caja):** Vendedor obligatorio al cobrar (primer paso del diálogo), incluir pendientes del cliente en el ticket, cobro íntegro con selección de método + botón "Pagar", diálogo venta completada con vendedor y diseño ajustado.
- **Resumen de caja e históricos:** Columna "Vendedor" en ventas y tickets.
- **Correcciones de build:** TypeScript en accounting, products, accounting-content, product-form para que el deploy pase.

---

*Generado para poder recuperar el estado estable de la plataforma.*
