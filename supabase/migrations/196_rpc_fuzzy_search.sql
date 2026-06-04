-- ============================================================
-- Migration 196: RPC de búsqueda difusa (fuzzy) con trigram + ranking
--
-- Problema: los buscadores usan .ilike('search_text', '%term%') (substring
-- exacto). Es insensible a acentos y multipalabra (mig. 142), pero NO tolera
-- erratas: "Llavna" no encuentra "Llavona", "panatlon" no encuentra "pantalon".
--
-- Solución: un RPC genérico que, sobre la columna `search_text` (lower+unaccent,
-- indexada con GIN gin_trgm_ops), usa el operador word_similarity de pg_trgm
-- para devolver ids candidatos rankeados por relevancia. PostgREST no permite
-- usar funciones/operadores trigram en filtros, por eso vive en un RPC.
--
-- Uso desde queryList: solo como FALLBACK cuando la búsqueda estricta da 0
-- resultados (es justo cuando hay errata) — así el camino feliz no cambia.
--
-- Seguridad: p_table se valida contra una whitelist y se interpola con %I;
-- el término va bindeado (USING), nunca concatenado → sin inyección.
--
-- Operador: `$1 <% t.search_text` = word_similarity($1, search_text) >= umbral.
-- Con la columna indexada a la DERECHA del operador, el índice GIN acelera la
-- búsqueda (patrón documentado en pg_trgm para autocompletado).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fuzzy_search_ids(
  p_table text,
  p_term text,
  p_limit int DEFAULT 50
) RETURNS TABLE (id uuid, score real)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_term text := lower(public.f_unaccent(coalesce(p_term, '')));
BEGIN
  -- Términos de <2 chars son ruido (devuelven casi todo). No buscamos.
  IF length(trim(v_term)) < 2 THEN
    RETURN;
  END IF;

  -- Whitelist: solo tablas con columna `search_text` + índice GIN (mig. 142).
  IF p_table NOT IN (
    'clients', 'products', 'suppliers', 'vouchers', 'fabrics', 'ap_supplier_invoices'
  ) THEN
    RAISE EXCEPTION 'fuzzy_search_ids: tabla no permitida: %', p_table;
  END IF;

  -- Umbral de word_similarity local a la transacción (is_local = true) para no
  -- contaminar el pool de conexiones compartido de PostgREST. 0.3 = permisivo
  -- (favorece recall); como solo corre en el fallback, no degrada el camino feliz.
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.3', true);

  RETURN QUERY EXECUTE format($q$
    SELECT t.id, word_similarity($1, t.search_text)::real AS score
    FROM %I t
    WHERE $1 <%% t.search_text
    ORDER BY score DESC
    LIMIT $2
  $q$, p_table) USING v_term, p_limit;
END;
$$;

COMMENT ON FUNCTION public.fuzzy_search_ids(text, text, int) IS
  'Búsqueda difusa (trigram word_similarity) sobre search_text. Devuelve ids '
  'rankeados por relevancia. Usado como fallback por queryList cuando la '
  'búsqueda estricta (ilike) da 0 resultados. Whitelist de tablas + bind seguro.';
