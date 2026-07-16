-- PostgreSQL 18：只读检查时间配置、时间列、周期约束及区间重叠。

SELECT
  current_setting('TimeZone') AS session_time_zone,
  transaction_timestamp() AS transaction_time,
  statement_timestamp() AS statement_time,
  clock_timestamp() AS wall_clock_time;

SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  datetime_precision,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE data_type IN (
  'date',
  'time without time zone',
  'time with time zone',
  'timestamp without time zone',
  'timestamp with time zone',
  'interval'
)
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, ordinal_position;

-- conperiod=true 表示 WITHOUT OVERLAPS 或 PERIOD 相关约束。
SELECT
  namespace.nspname AS schema_name,
  relation.relname AS table_name,
  constraint_meta.conname AS constraint_name,
  constraint_meta.contype AS constraint_type,
  constraint_meta.conperiod AS is_temporal_period_constraint,
  pg_catalog.pg_get_constraintdef(constraint_meta.oid) AS constraint_definition
FROM pg_catalog.pg_constraint AS constraint_meta
JOIN pg_catalog.pg_class AS relation
  ON relation.oid = constraint_meta.conrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND (constraint_meta.contype = 'x' OR constraint_meta.conperiod)
ORDER BY namespace.nspname, relation.relname, constraint_meta.conname;

-- 将表名和业务键替换为目标历史表后运行；查询本身不修改数据。
SELECT
  a.product_id,
  a.id AS left_version_id,
  b.id AS right_version_id,
  tstzrange(a.valid_from, a.valid_to, '[)') AS left_period,
  tstzrange(b.valid_from, b.valid_to, '[)') AS right_period
FROM product_price_history AS a
JOIN product_price_history AS b
  ON b.product_id = a.product_id
 AND b.id > a.id
 AND tstzrange(a.valid_from, a.valid_to, '[)')
     && tstzrange(b.valid_from, b.valid_to, '[)')
ORDER BY a.product_id, a.valid_from, b.valid_from;
