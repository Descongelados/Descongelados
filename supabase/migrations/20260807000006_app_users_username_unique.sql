-- ============================================================
-- Restricción UNIQUE en app_users.username
--
-- Problema anterior: la unicidad del username solo se validaba
-- en el cliente comparando el array en memoria. Si dos admins
-- creaban el mismo usuario simultáneamente, ambos pasaban la
-- validación y se creaban duplicados.
--
-- Solución: restricción UNIQUE en la columna, PostgreSQL
-- rechaza el INSERT/UPDATE con error si el username ya existe.
-- ============================================================

ALTER TABLE app_users
  ADD CONSTRAINT app_users_username_unique UNIQUE (username);
