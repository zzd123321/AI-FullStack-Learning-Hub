-- 第 15 课 PostgreSQL 18：只读性能诊断。
-- 不重置统计、不创建扩展、不终止 backend，也不读写业务表。
-- 部分字段受统计配置和监控权限影响，其他用户的 query 可能被隐藏。

SELECT version() AS postgresql_version,
       current_database() AS database_name,
       current_user AS observer;

SHOW track_io_timing;
SHOW compute_query_id;

-- 1. 当前 client backend：state 与 wait_event 必须组合解释。
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  wait_event_type,
  wait_event,
  now() - backend_start AS connection_age,
  now() - xact_start AS transaction_age,
  now() - query_start AS query_age,
  LEFT(query, 300) AS current_or_last_query
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND pid <> pg_backend_pid()
ORDER BY xact_start NULLS LAST, query_start NULLS LAST;

-- 2. 特别关注 idle in transaction 和长事务。
SELECT
  pid,
  usename,
  application_name,
  state,
  now() - xact_start AS transaction_age,
  wait_event_type,
  wait_event,
  LEFT(query, 300) AS current_or_last_query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
  AND pid <> pg_backend_pid()
ORDER BY xact_start;

-- 3. 使用官方 pg_blocking_pids() 构造直接阻塞关系。
SELECT
  blocked.pid AS blocked_pid,
  blocked.usename AS blocked_user,
  now() - blocked.query_start AS blocked_for,
  blocked.wait_event_type,
  blocked.wait_event,
  LEFT(blocked.query, 300) AS blocked_query,
  blocker.pid AS blocker_pid,
  blocker.usename AS blocker_user,
  blocker.state AS blocker_state,
  now() - blocker.xact_start AS blocker_transaction_age,
  LEFT(blocker.query, 300) AS blocker_current_or_last_query
FROM pg_stat_activity AS blocked
CROSS JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS blocker_pid(pid)
JOIN pg_stat_activity AS blocker ON blocker.pid = blocker_pid.pid
ORDER BY blocked.query_start;

-- 4. 每数据库累计统计。命中率只表示 PostgreSQL shared buffer 层。
SELECT
  datname,
  numbackends,
  xact_commit,
  xact_rollback,
  blks_read,
  blks_hit,
  ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2)
    AS shared_buffer_hit_percent,
  temp_files,
  pg_size_pretty(temp_bytes) AS temp_bytes,
  deadlocks,
  stats_reset
FROM pg_stat_database
WHERE datname IS NOT NULL
ORDER BY datname;

-- 5. 表扫描、dead tuple、vacuum/analyze 线索。
SELECT
  schemaname,
  relname,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup,
  n_dead_tup,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY seq_tup_read DESC
LIMIT 20;

-- 6. 索引读取次数与大小。idx_scan = 0 不代表可以直接删除索引。
SELECT
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

-- 7. 检查 pg_stat_statements 是否可用/已安装；不自动创建扩展。
SELECT
  name,
  default_version,
  installed_version
FROM pg_available_extensions
WHERE name = 'pg_stat_statements';

-- 仅当上一查询显示 installed_version 非空时，单独取消注释并执行下面模板。
-- 若未加载 shared_preload_libraries，即使扩展对象存在也可能报错。
-- SELECT
--   queryid,
--   calls,
--   ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
--   ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
--   rows,
--   shared_blks_hit,
--   shared_blks_read,
--   temp_blks_written,
--   wal_bytes,
--   LEFT(query, 300) AS normalized_query
-- FROM pg_stat_statements
-- WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
-- ORDER BY total_exec_time DESC
-- LIMIT 20;

-- 8. 只读、隔离的实际计划演示，不访问业务表。
-- TIMING OFF 降低逐节点读时钟开销；ANALYZE 仍会真正执行查询。
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY ON)
SELECT COUNT(*)
FROM generate_series(1, 1000) AS learning_sequence(n)
WHERE n % 10 = 0;
