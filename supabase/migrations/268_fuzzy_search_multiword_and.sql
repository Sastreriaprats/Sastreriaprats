-- ============================================================
-- Migration 268: búsqueda difusa multi-palabra con AND por token
--
-- Problema (reportado jul-2026): buscar "ignacio gimenez" devolvía TODOS los
-- "Jiménez". Causa: cuando la búsqueda estricta (ilike substring, AND por token)
-- da 0 resultados, queryList/resolveClientIdsForSearch caen al fallback difuso
-- `fuzzy_search_ids`, que pasaba el término ENTERO a word_similarity. Como
-- word_similarity busca la mejor ventana de coincidencia en search_text,
-- "gimenez"≈"jimenez" (comparten trigramas) supera el umbral 0.3 y saca todos
-- los Jiménez, IGNORANDO por completo el token "ignacio". El fuzzy no respetaba
-- el AND multi-palabra que sí aplica la pasada estricta.
--
-- Solución: tokenizar el término dentro del RPC y exigir que CADA token
-- (>= 2 chars) supere el umbral de word_similarity (AND), no la cadena entera.
-- Score = suma de word_similarity por token (mejor coincidencia global primero).
--   · "ignacio gimenez" → tokens [ignacio, gimenez]: solo casan filas parecidas
--     a AMBOS → "Ignacio Jiménez" (o 0 si no existe), nunca todos los Jiménez.
--   · "jimenez" (1 token) → comportamiento idéntico al anterior: todos los Jiménez.
--   · "jorje llavona" (errata) → [jorje, llavona]: sigue tolerando la errata en
--     cada palabra por separado y exige que ambas casen → "Jorge Llavona".
--
-- Firma, whitelist, umbral (0.3, is_local) y seguridad (%I + bind USING) se
-- conservan de la mig. 196. Los callers (fuzzySearchIds, fuzzyFallback,
-- resolveClientIdsForSearch) no cambian: siguen pasando el término completo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fuzzy_search_ids(
  p_table text,
  p_term text,
  p_limit int DEFAULT 50
) RETURNS TABLE (id uuid, score real)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_term text := lower(public.f_unaccent(coalesce(p_term, '')));
  v_tokens text[];
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

  -- Multi-palabra: cada token (>= 2 chars) debe parecerse (AND). Tokens de 1
  -- char se descartan como ruido (casarían casi todo por trigram).
  SELECT array_agg(tok) INTO v_tokens
  FROM unnest(regexp_split_to_array(trim(v_term), '\s+')) AS tok
  WHERE length(tok) >= 2;

  IF v_tokens IS NULL OR array_length(v_tokens, 1) = 0 THEN
    RETURN;
  END IF;

  -- Umbral de word_similarity local a la transacción (is_local = true) para no
  -- contaminar el pool de conexiones compartido de PostgREST. 0.3 = permisivo
  -- (favorece recall); como solo corre en el fallback, no degrada el camino feliz.
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.3', true);

  -- Cada token debe superar el umbral (NOT EXISTS token que NO case = todos casan).
  -- Score = suma de word_similarity por token. `<%%` escapa el `%` de format().
  RETURN QUERY EXECUTE format($q$
    SELECT t.id,
           (SELECT sum(word_similarity(tok, t.search_text))
              FROM unnest($1::text[]) AS tok)::real AS score
    FROM %I t
    WHERE NOT EXISTS (
      SELECT 1 FROM unnest($1::text[]) AS tok
      WHERE NOT (tok <%% t.search_text)
    )
    ORDER BY score DESC
    LIMIT $2
  $q$, p_table) USING v_tokens, p_limit;
END;
$$;

COMMENT ON FUNCTION public.fuzzy_search_ids(text, text, int) IS
  'Búsqueda difusa (trigram word_similarity) sobre search_text, MULTI-PALABRA '
  'con AND por token (mig. 268): cada palabra debe parecerse, no la cadena '
  'entera. Devuelve ids rankeados por relevancia. Fallback de queryList cuando '
  'la búsqueda estricta (ilike) da 0. Whitelist de tablas + bind seguro.';
