-- ============================================================================
-- 285 · CATEGORÍAS DE CLIENTE EDITABLES
-- ----------------------------------------------------------------------------
-- Petición de Isma (15-sep-2026): poder añadir la categoría "La fábrica" o,
-- mejor, que la tienda cree sus propias categorías sin depender de soporte.
--
-- Hasta ahora `clients.category` era el ENUM de Postgres `client_category`
-- (standard, vip, premium, gold, ambassador) y la pantalla solo enseñaba dos.
-- Un enum no admite valores nuevos sin DDL, así que la categoría pasa a ser
-- texto con FK a una tabla propia que se edita desde Configuración.
--
-- Estado antes de migrar: 2.430 clientes 'standard' y 2 'vip'. Ningún
-- premium/gold/ambassador: se conservan como filas INACTIVAS para que ningún
-- dato ni ruta antigua se quede sin referencia.
--
-- Dependencias revisadas (pg_depend + funciones + RLS): ninguna función ni
-- política usa la categoría. Solo la vista v_clients_summary expone la
-- columna con el tipo enum, y Postgres no deja cambiar el tipo de una columna
-- que usa una vista: se tira y se recrea IDÉNTICA (security_invoker y grants
-- incluidos). El índice idx_clients_category se reconstruye solo.
--
-- El enum `client_category` NO se borra: queda sin uso y es inofensivo.
-- ============================================================================

-- 1. Catálogo -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Clave estable que guarda clients.category. Se genera al crear y NO se
  -- edita: renombrar cambia `name`, nunca `code`.
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_categories IS
  'Categorías de cliente editables desde Configuración (mig 285). clients.category guarda el code.';

INSERT INTO public.client_categories (code, name, sort_order, is_active) VALUES
  ('standard',   'Normal',     0,  true),
  ('vip',        'VIP',        1,  true),
  ('fabrica',    'La fábrica', 2,  true),
  ('premium',    'Premium',    10, false),
  ('gold',       'Gold',       11, false),
  ('ambassador', 'Embajador',  12, false)
ON CONFLICT (code) DO NOTHING;

-- Mismo patrón que product_categories: lectura para todos, escritura con
-- permiso. Las server actions usan service_role; esto es defensa en profundidad.
ALTER TABLE public.client_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_categories_select ON public.client_categories;
CREATE POLICY client_categories_select ON public.client_categories
  FOR SELECT USING (true);
DROP POLICY IF EXISTS client_categories_modify ON public.client_categories;
CREATE POLICY client_categories_modify ON public.client_categories
  FOR ALL USING (user_has_permission(auth.uid(), 'clients.edit'));

-- 2. La vista que expone la columna estorba al cambio de tipo ----------------
DROP VIEW IF EXISTS public.v_clients_summary;

-- 3. clients.category: enum → texto con FK -----------------------------------
ALTER TABLE public.clients ALTER COLUMN category DROP DEFAULT;
ALTER TABLE public.clients ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE public.clients ALTER COLUMN category SET DEFAULT 'standard';

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_category_fkey;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_category_fkey
  FOREIGN KEY (category) REFERENCES public.client_categories(code)
  ON UPDATE CASCADE;

-- 4. Vista recreada idéntica ---------------------------------------------------
CREATE VIEW public.v_clients_summary WITH (security_invoker = on) AS
 SELECT c.id,
    c.client_code,
    c.full_name,
    c.email,
    c.phone,
    c.client_type,
    c.category,
    c.tags,
    c.total_spent,
    c.total_pending,
    c.last_purchase_date,
    c.purchase_count,
    c.average_ticket,
    c.is_active,
    c.home_store_id,
    s.name AS home_store_name,
        CASE
            WHEN c.total_pending = 0::numeric THEN 'paid'::text
            WHEN c.total_pending > 0::numeric THEN 'pending'::text
            ELSE 'paid'::text
        END AS payment_status,
    c.created_at
   FROM clients c
     LEFT JOIN stores s ON s.id = c.home_store_id;

GRANT ALL ON public.v_clients_summary TO anon, authenticated, service_role;

-- 5. PostgREST: que vea el tipo nuevo de la columna y la tabla nueva ---------
NOTIFY pgrst, 'reload schema';
