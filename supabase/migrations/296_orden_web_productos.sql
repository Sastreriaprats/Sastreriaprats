-- 296 · Orden manual de los productos en la web (petición de Isma y Joaquín, oct-2026).
--
-- `web_sort_order` es la posición del producto en el catálogo público cuando se
-- ordena por "Recomendados" (el orden por defecto). NULL = sin colocar: va al
-- final, por nombre. Con todo a NULL la web sale igual que antes (A-Z).
--
-- Es una posición GLOBAL: ordenar una categoría reparte entre sus productos las
-- posiciones que ya tenían, así la categoría queda como se ha dejado y conserva
-- su sitio dentro de la boutique completa.

alter table public.products add column if not exists web_sort_order integer;

comment on column public.products.web_sort_order is
  'Posición en la web (orden "Recomendados"). NULL = sin colocar, al final por nombre.';

-- Guarda todas las posiciones en una sola sentencia (una llamada en vez de una
-- UPDATE por producto). Solo toca las filas cuya posición cambia.
create or replace function public.rpc_set_products_web_sort_order(p_ids uuid[], p_positions integer[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if coalesce(array_length(p_ids, 1), 0) <> coalesce(array_length(p_positions, 1), 0) then
    raise exception 'El número de productos y de posiciones no coincide';
  end if;

  update products p
     set web_sort_order = x.pos
    from unnest(p_ids, p_positions) as x(id, pos)
   where p.id = x.id
     and p.web_sort_order is distinct from x.pos;

  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.rpc_set_products_web_sort_order(uuid[], integer[]) from public, anon, authenticated;
grant execute on function public.rpc_set_products_web_sort_order(uuid[], integer[]) to service_role;
