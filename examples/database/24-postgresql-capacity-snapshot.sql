-- 第 24 课 PostgreSQL 18：容量只读快照。
-- 累积计数必须结合 stats_reset 和两个时间点求 rate；不重置统计或创建 extension。

SELECT
  version() AS postgresql_version,
  current_database() AS database_name,
  current_setting('max_connections') AS max_connections,
  current_setting('shared_buffers') AS shared_buffers,
  current_setting('work_mem') AS work_mem,
  current_setting('maintenance_work_mem') AS maintenance_work_mem;

-- 当前连接状态与等待类型，是并发快照而非长期 rate。
SELECT
  state,
  wait_event_type,
  count(*) AS session_count
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type
ORDER BY session_count DESC, state, wait_event_type;

-- 数据库级累计工作量、临时文件、死锁与统计重置时间。
SELECT
  datname,
  numbackends,
  xact_commit,
  xact_rollback,
  blks_read,
  blks_hit,
  tup_returned,
  tup_fetched,
  tup_inserted,
  tup_updated,
  tup_deleted,
  temp_files,
  temp_bytes,
  deadlocks,
  stats_reset
FROM pg_stat_database
WHERE datname = current_database();

-- WAL 累计统计用于计算日志 bytes/s 与 full page image 变化。
SELECT
  wal_records,
  wal_fpi,
  wal_bytes,
  wal_buffers_full,
  wal_write,
  wal_sync,
  wal_write_time,
  wal_sync_time,
  stats_reset
FROM pg_stat_wal;

-- 当前数据库中最大的用户表；total 包含索引和 TOAST。
SELECT
  namespace.nspname AS schema_name,
  relation.relname AS table_name,
  pg_relation_size(relation.oid) AS table_bytes,
  pg_indexes_size(relation.oid) AS index_bytes,
  pg_total_relation_size(relation.oid) AS total_bytes
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE relation.relkind IN ('r', 'p')
  AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY total_bytes DESC
LIMIT 100;

-- 只检查扩展是否存在；不存在时不尝试 CREATE EXTENSION。
SELECT EXISTS (
  SELECT 1
  FROM pg_extension
  WHERE extname = 'pg_stat_statements'
) AS pg_stat_statements_installed;
