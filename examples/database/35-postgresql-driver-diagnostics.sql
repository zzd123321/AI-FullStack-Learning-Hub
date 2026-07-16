-- PostgreSQL 18：只读检查 session、prepared statement 与 pg_stat_statements。

SELECT
  current_setting('TimeZone') AS session_time_zone,
  current_setting('search_path') AS search_path,
  current_setting('transaction_isolation') AS transaction_isolation,
  current_setting('plan_cache_mode') AS plan_cache_mode,
  current_setting('statement_timeout') AS statement_timeout,
  current_setting('lock_timeout') AS lock_timeout;

-- 不输出 statement 文本；generic_plans/custom_plans 可帮助发现计划复用模式。
SELECT
  name,
  prepare_time,
  parameter_types,
  result_types,
  from_sql,
  generic_plans,
  custom_plans
FROM pg_catalog.pg_prepared_statements
ORDER BY prepare_time;

-- 先确认 pg_stat_statements 是否安装；扩展还需由管理员预加载和配置。
SELECT
  extension_meta.extname AS extension_name,
  extension_meta.extversion AS extension_version
FROM pg_catalog.pg_extension AS extension_meta
WHERE extension_meta.extname = 'pg_stat_statements';

-- 安装并授权 pg_stat_statements 后可执行此查询；不输出 query 文本。
-- 扩展可安装到其他 schema，届时将 public 替换为上一步查到的实际 schema。
SELECT
  userid,
  dbid,
  queryid,
  plans,
  calls,
  ROUND(total_plan_time::numeric, 3) AS total_plan_ms,
  ROUND(total_exec_time::numeric, 3) AS total_exec_ms,
  rows,
  shared_blks_hit,
  shared_blks_read,
  temp_blks_written,
  wal_bytes,
  stats_since
FROM public.pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 100;
