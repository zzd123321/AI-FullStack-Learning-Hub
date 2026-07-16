-- PostgreSQL 18：只读盘点 functions/procedures、triggers 和调度相关扩展。
-- 不读取 prosrc 或 trigger definition，避免暴露对象 body。

SELECT
  namespace.nspname AS schema_name,
  routine.proname AS routine_name,
  CASE routine.prokind
    WHEN 'f' THEN 'function'
    WHEN 'p' THEN 'procedure'
    WHEN 'a' THEN 'aggregate'
    WHEN 'w' THEN 'window'
  END AS routine_kind,
  pg_catalog.pg_get_function_identity_arguments(routine.oid) AS identity_arguments,
  routine.provolatile AS volatility_code,
  routine.proparallel AS parallel_code,
  routine.prosecdef AS security_definer,
  routine.proleakproof AS leakproof,
  role_meta.rolname AS owner_name,
  routine.proconfig AS attached_configuration
FROM pg_catalog.pg_proc AS routine
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = routine.pronamespace
JOIN pg_catalog.pg_roles AS role_meta
  ON role_meta.oid = routine.proowner
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY namespace.nspname, routine.proname, identity_arguments;

SELECT
  namespace.nspname AS schema_name,
  relation.relname AS table_name,
  trigger_meta.tgname AS trigger_name,
  trigger_meta.tgenabled AS enabled_code,
  trigger_meta.tgisinternal AS is_internal,
  function_namespace.nspname AS function_schema,
  function_meta.proname AS function_name
FROM pg_catalog.pg_trigger AS trigger_meta
JOIN pg_catalog.pg_class AS relation
  ON relation.oid = trigger_meta.tgrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
JOIN pg_catalog.pg_proc AS function_meta
  ON function_meta.oid = trigger_meta.tgfoid
JOIN pg_catalog.pg_namespace AS function_namespace
  ON function_namespace.oid = function_meta.pronamespace
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY namespace.nspname, relation.relname, trigger_meta.tgname;

-- PostgreSQL 核心没有与 MySQL Event Scheduler 同形的内置调度器。
-- 先盘点是否安装 pg_cron 等扩展；具体 job 表需按扩展版本和权限另查。
SELECT
  extension_meta.extname AS extension_name,
  extension_meta.extversion AS extension_version,
  namespace.nspname AS extension_schema,
  role_meta.rolname AS extension_owner
FROM pg_catalog.pg_extension AS extension_meta
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = extension_meta.extnamespace
JOIN pg_catalog.pg_roles AS role_meta
  ON role_meta.oid = extension_meta.extowner
WHERE extension_meta.extname IN ('pg_cron', 'pgagent')
ORDER BY extension_meta.extname;
