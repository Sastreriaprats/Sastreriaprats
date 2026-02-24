-- Limpiar datos residuales y crear admin correctamente
-- Pegar en SQL Editor de Supabase y ejecutar

-- 1. Limpiar cualquier dato huérfano
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin@sastreriaprats.com'
);
DELETE FROM public.user_stores WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin@sastreriaprats.com'
);
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin@sastreriaprats.com'
);
DELETE FROM public.profiles WHERE email = 'admin@sastreriaprats.com';
DELETE FROM auth.users WHERE email = 'admin@sastreriaprats.com';

-- 2. Verificar que el trigger está bien
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verificación
SELECT 'Limpieza completada' AS resultado;
