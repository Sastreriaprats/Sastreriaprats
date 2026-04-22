-- Migración 121: Eliminar tabla audit_log duplicada (singular)
-- Todos los registros van a audit_logs (plural) vía RPC log_audit o insert directo
DROP TABLE IF EXISTS audit_log;
