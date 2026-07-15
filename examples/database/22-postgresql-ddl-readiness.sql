-- 第 22 课 PostgreSQL 18：DDL、并发索引与约束就绪度只读诊断。
-- 不执行 ALTER TABLE、CREATE INDEX、VALIDATE 或数据变更。

SELECT
  version() AS postgresql_version,
  current_database() AS database_name,
  current_setting('lock_timeout') AS lock_timeout,
  current_setting('statement_timeout') AS statement_timeout,
  current_setting('maintenance_work_mem') AS maintenance_work_mem,
  current_setting('max_parallel_maintenance_workers') AS max_parallel_maintenance_workers;

-- 长事务和 idle in transaction 会延迟 DDL、concurrent index 与 VACUUM。
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  xact_start,
  clock_timestamp() - xact_start AS transaction_age,
  wait_event_type,
  wait_event,
  LEFT(query, 300) AS current_query
FROM pg_stat_activity
WHERE datname = current_database()
  AND xact_start IS NOT NULL
  AND pid <> pg_backend_pid()
ORDER BY xact_start;

-- 未授予的 relation lock 表示等待；relation 为空的锁类型不在本查询范围。
SELECT
  lock.pid,
  lock.mode,
  lock.granted,
  lock.waitstart,
  lock.relation::regclass AS relation_name,
  activity.application_name,
  activity.state,
  LEFT(activity.query, 300) AS current_query
FROM pg_locks AS lock
LEFT JOIN pg_stat_activity AS activity ON activity.pid = lock.pid
WHERE lock.database = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND lock.relation IS NOT NULL
ORDER BY lock.granted, lock.waitstart NULLS LAST, lock.pid;

-- CREATE INDEX/REINDEX 的当前阶段和扫描进度；无任务时为空。
SELECT
  pid,
  command,
  phase,
  relid::regclass AS table_name,
  index_relid::regclass AS index_name,
  lockers_total,
  lockers_done,
  blocks_total,
  blocks_done,
  tuples_total,
  tuples_done,
  partitions_total,
  partitions_done
FROM pg_stat_progress_create_index
ORDER BY pid;

-- 并发构建失败可能留下 INVALID/尚未 ready 的索引。
SELECT
  indexrelid::regclass AS index_name,
  indrelid::regclass AS table_name,
  indisvalid AS is_valid,
  indisready AS is_ready,
  indislive AS is_live
FROM pg_index
WHERE NOT indisvalid OR NOT indisready OR NOT indislive
ORDER BY table_name, index_name;

-- NOT VALID constraint 必须最终进入 convalidated=true 才能证明历史数据满足。
SELECT
  c.oid,
  c.conname AS constraint_name,
  c.contype AS constraint_type,
  c.conrelid::regclass AS table_name,
  c.convalidated AS is_validated
FROM pg_constraint AS c
WHERE c.conrelid <> 0
  AND NOT c.convalidated
ORDER BY table_name, constraint_name;
