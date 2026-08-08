-- Habilitar pgcrypto para comparación bcrypt
create extension if not exists pgcrypto;

-- Función RPC: verifica usuario y contraseña bcrypt, retorna el registro si es válido
create or replace function verify_login(p_username text, p_password text)
returns json
language plpgsql
security definer
as $$
declare
  v_user app_users%rowtype;
begin
  select * into v_user
  from app_users
  where lower(username) = lower(p_username)
    and active = true
  limit 1;

  if not found then
    return null;
  end if;

  -- Comparar contraseña contra hash bcrypt almacenado
  if crypt(p_password, v_user.password) = v_user.password then
    return row_to_json(v_user);
  end if;

  return null;
end;
$$;

-- Permitir acceso anónimo a esta función (la validación la hace la propia función)
grant execute on function verify_login(text, text) to anon;
