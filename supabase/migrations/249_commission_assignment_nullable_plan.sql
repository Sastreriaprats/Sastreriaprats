-- ============================================================
-- Migración 249: permitir empleado "comisionable" SIN plan asignado.
--
-- Hasta ahora un empleado solo aparecía en la lista de comisiones si tenía un
-- plan (commission_assignments.plan_id NOT NULL). El panel "Asignación por
-- empleado" listaba a TODOS los activos, mezclando gente que no comisiona.
--
-- Nuevo modelo: la lista de "usuarios que comisionan" se cura a mano. Un empleado
-- está EN la lista si tiene una fila en commission_assignments; el plan puede
-- quedar a NULL ("comisiona pero sin plan todavía"). El motor de cálculo ya
-- ignora las filas sin plan (no genera comisión). Quitar a un usuario = borrar
-- su fila (botón en el panel).
-- ============================================================

ALTER TABLE commission_assignments ALTER COLUMN plan_id DROP NOT NULL;
