-- 276_revoke_merge_clients_grants.sql
--
-- `rpc_merge_clients` y `rpc_preview_client_merge` son SECURITY DEFINER (mig
-- 183) y tenían EXECUTE concedido a PUBLIC, anon y authenticated. Al ser
-- SECURITY DEFINER se ejecutan con los privilegios de su dueño y saltan RLS,
-- así que cualquiera con la clave anónima -que es pública, va en el navegador-
-- podía fusionar dos fichas de cliente y BORRAR la de origen, sin sesión, sin
-- permiso y sin dejar rastro en la auditoría de la aplicación.
--
-- La aplicación no las llama nunca desde el navegador: las dos server actions
-- de src/actions/clients.ts exigen el permiso `clients.merge` (que hoy solo
-- tiene el rol administrador) y las invocan con service_role, que conserva su
-- EXECUTE. Revocar el resto no quita funcionalidad a nadie.
--
-- No toca el cuerpo de las funciones ni un solo dato.

REVOKE ALL ON FUNCTION public.rpc_merge_clients(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_merge_clients(uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_merge_clients(uuid, uuid, boolean) FROM authenticated;

REVOKE ALL ON FUNCTION public.rpc_preview_client_merge(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_preview_client_merge(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_preview_client_merge(uuid, uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_merge_clients(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_preview_client_merge(uuid, uuid) TO service_role;
