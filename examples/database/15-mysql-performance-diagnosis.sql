-- 第 15 课 MySQL 8.4：只读性能诊断。
-- 不重置统计、不修改全局配置、不终止会话，也不读写业务表。
-- 部分视图需要 Performance Schema/sys 已启用和相应监控权限。

SELECT VERSION() AS mysql_version,
       @@performance_schema AS performance_schema_enabled;

-- 慢查询日志只做配置检查；生产修改必须走变更流程。
SHOW VARIABLES WHERE Variable_name IN (
  'slow_query_log',
  'long_query_time',
  'log_queries_not_using_indexes',
  'min_examined_row_limit'
);

-- 1. 按观察窗口内总执行时间找总体影响最大的归一化 SQL。
SELECT
  SCHEMA_NAME,
  LEFT(DIGEST_TEXT, 300) AS digest_text,
  COUNT_STAR AS executions,
  sys.format_time(SUM_TIMER_WAIT) AS total_latency,
  sys.format_time(AVG_TIMER_WAIT) AS avg_latency,
  sys.format_time(MAX_TIMER_WAIT) AS max_latency,
  ROUND(SUM_ROWS_EXAMINED / NULLIF(COUNT_STAR, 0)) AS rows_examined_avg,
  ROUND(SUM_ROWS_SENT / NULLIF(COUNT_STAR, 0)) AS rows_sent_avg,
  SUM_ERRORS AS errors,
  FIRST_SEEN,
  LAST_SEEN
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME IS NOT NULL
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 20;

-- 2. 找扫描放大明显的语句。高 examined/sent 是线索，不自动等于错误。
SELECT
  SCHEMA_NAME,
  LEFT(DIGEST_TEXT, 300) AS digest_text,
  COUNT_STAR AS executions,
  SUM_ROWS_EXAMINED AS rows_examined,
  SUM_ROWS_SENT AS rows_sent,
  ROUND(SUM_ROWS_EXAMINED / NULLIF(SUM_ROWS_SENT, 0), 2)
    AS examined_per_sent,
  SUM_NO_INDEX_USED AS no_index_used,
  SUM_CREATED_TMP_DISK_TABLES AS tmp_disk_tables
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME IS NOT NULL
  AND COUNT_STAR > 0
ORDER BY SUM_ROWS_EXAMINED DESC
LIMIT 20;

-- 3. 当前前台连接快照。短查询可能在快照之间完成，应结合 digest。
SELECT
  PROCESSLIST_ID AS connection_id,
  PROCESSLIST_USER AS user_name,
  PROCESSLIST_HOST AS client_host,
  PROCESSLIST_DB AS database_name,
  PROCESSLIST_COMMAND AS command_name,
  PROCESSLIST_TIME AS state_seconds,
  PROCESSLIST_STATE AS state_name,
  LEFT(PROCESSLIST_INFO, 300) AS current_statement
FROM performance_schema.threads
WHERE TYPE = 'FOREGROUND'
  AND PROCESSLIST_ID IS NOT NULL
ORDER BY PROCESSLIST_TIME DESC, PROCESSLIST_ID;

-- 4. 长事务，包括当前可能没有活动语句但仍持锁的事务。
SELECT
  trx_mysql_thread_id AS connection_id,
  trx_id,
  trx_state,
  trx_started,
  TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS transaction_age_seconds,
  trx_rows_locked,
  trx_rows_modified,
  LEFT(trx_query, 300) AS current_statement
FROM information_schema.innodb_trx
ORDER BY trx_started;

-- 5. InnoDB 行锁等待链。只展示，不执行视图中的 KILL 建议。
SELECT
  wait_started,
  wait_age_secs,
  locked_table_schema,
  locked_table_name,
  locked_index,
  waiting_pid,
  LEFT(waiting_query, 300) AS waiting_query,
  blocking_pid,
  LEFT(blocking_query, 300) AS blocking_query,
  blocking_trx_age
FROM sys.innodb_lock_waits
ORDER BY wait_age_secs DESC;

-- 6. DDL 常见的 metadata lock 等待，与 InnoDB 行锁是不同层次。
SELECT
  object_schema,
  object_name,
  waiting_pid,
  waiting_lock_type,
  waiting_query_secs,
  LEFT(waiting_query, 300) AS waiting_query,
  blocking_pid,
  blocking_lock_type,
  blocking_lock_duration
FROM sys.schema_table_lock_waits
ORDER BY waiting_query_secs DESC;

-- 7. 表级 I/O 汇总。Performance Schema 重置/重启会改变观察窗口。
SELECT
  OBJECT_SCHEMA,
  OBJECT_NAME,
  COUNT_READ,
  sys.format_time(SUM_TIMER_READ) AS total_read_latency,
  COUNT_WRITE,
  sys.format_time(SUM_TIMER_WRITE) AS total_write_latency,
  COUNT_FETCH,
  COUNT_INSERT,
  COUNT_UPDATE,
  COUNT_DELETE
FROM performance_schema.table_io_waits_summary_by_table
WHERE OBJECT_SCHEMA NOT IN ('mysql', 'performance_schema', 'sys')
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 20;

-- 8. 只读、隔离的 EXPLAIN ANALYZE 演示。
-- EXPLAIN ANALYZE 会实际运行 SELECT，但该查询只生成 1,000 个内存数字。
EXPLAIN ANALYZE
WITH RECURSIVE learning_sequence(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM learning_sequence WHERE n < 1000
)
SELECT COUNT(*)
FROM learning_sequence
WHERE MOD(n, 10) = 0;
