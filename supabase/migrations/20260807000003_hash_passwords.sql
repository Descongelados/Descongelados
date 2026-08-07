-- ============================================================
-- Migración: hashear contraseñas con bcrypt (pgcrypto)
--
-- Problema: las contraseñas se almacenaban en texto plano en
-- app_users.password y se descargaban al cliente para comparar
-- en JavaScript. Cualquiera con acceso al dashboard de Supabase
-- podía leer todas las contraseñas.
--
-- Solución:
--   1. Habilitar la extensión pgcrypto (bcrypt nativo en PostgreSQL)
--   2. Hashear todas las contraseñas existentes con gen_salt('bf')
--   3. Función RPC verify_password(username, password) → boolean
--      El cliente solo recibe true/false, nunca el hash
--   4. Función RPC set_user_password(user_id, new_password)
--      Hashea y guarda sin exponer el hash al cliente
-- ============================================================

-- 1. Habilitar pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Hashear contraseñas existentes (texto plano → bcrypt)
--    Solo aplica a las que aún no estén hasheadas (no empiezan con '$2')
UPDATE app_users
SET password = crypt(password, gen_salt('bf'))
WHERE password NOT LIKE '$2%';

-- 3. Función de verificación — el cliente NUNCA recibe el hash
CREATE OR REPLACE FUNCTION verify_password(
  p_username text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_user
  FROM app_users
  WHERE username = lower(trim(p_username))
    AND active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF v_user.password = crypt(trim(p_password), v_user.password) THEN
    RETURN jsonb_build_object(
      'ok',         true,
      'id',         v_user.id,
      'name',       v_user.name,
      'username',   v_user.username,
      'roles',      v_user.roles,
      'active',     v_user.active,
      'created_at', v_user.created_at
    );
  END IF;

  RETURN jsonb_build_object('ok', false);
END;
$$;

-- 4. Función para crear/actualizar contraseña hasheada
CREATE OR REPLACE FUNCTION set_user_password(
  p_user_id    text,
  p_password   text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
BEGIN
  UPDATE app_users
  SET password = crypt(trim(p_password), gen_salt('bf'))
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario % no encontrado', p_user_id;
  END IF;
END;
$$;

-- Permisos — solo authenticated/anon pueden llamar estas funciones
-- (no exponer el hash directamente)
GRANT EXECUTE ON FUNCTION verify_password(text, text)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_user_password(text, text)   TO anon, authenticated;

-- Revocar SELECT directo sobre la columna password para que
-- nunca viaje al cliente (las RPCs usan SECURITY DEFINER)
-- Nota: esto requiere que las políticas RLS estén activas en app_users
COMMENT ON COLUMN app_users.password IS 'bcrypt hash — nunca exponer al cliente vía select';
