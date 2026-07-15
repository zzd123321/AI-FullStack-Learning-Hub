-- 第 22 课 MySQL 8.4：online DDL 就绪度只读诊断。
-- 不执行 ALTER、CREATE INDEX 或任何数据变更。

SELECT
  VERSION() AS mysql_version,
  @@hostname AS host_name,
  @@lock_wait_timeout AS metadata_lock_wait_timeout_seconds,
  @@innodb_lock_wait_timeout AS innodb_lock_wait_timeout_seconds,
  @@innodb_online_alter_log_max_size AS online_alter_log_max_bytes,
  @@tmpdir AS temporary_directory,
  @@binlog_format AS binlog_format;

-- 长事务可能持有 metadata lock，使本应短暂的 DDL 无法开始或结束。
SELECT
  trx_id,
  trx_state,
  trx_started,
  TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS age_seconds,
  trx_mysql_thread_id,
  trx_tables_locked,
  trx_rows_locked,
  trx_rows_modified,
  LEFT(trx_query, 300) AS current_query
FROM information_schema.INNODB_TRX
ORDER BY trx_started;

-- PENDING 表示正在等待 metadata lock；GRANTED 是当前持有者。
SELECT
  OBJECT_TYPE,
  OBJECT_SCHEMA,
  OBJECT_NAME,
  LOCK_TYPE,
  LOCK_DURATION,
  LOCK_STATUS,
  OWNER_THREAD_ID,
  OWNER_EVENT_ID
FROM performance_schema.metadata_locks
WHERE OBJECT_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
  AND LOCK_STATUS IN ('PENDING', 'GRANTED')
ORDER BY
  CASE LOCK_STATUS WHEN 'PENDING' THEN 0 ELSE 1 END,
  OBJECT_SCHEMA,
  OBJECT_NAME;

-- 大表/索引估算用于 DDL 空间和时间预演；InnoDB TABLE_ROWS 通常是估算值。
SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  ENGINE,
  TABLE_ROWS,
  DATA_LENGTH,
  INDEX_LENGTH,
  DATA_FREE
FROM information_schema.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY DATA_LENGTH + INDEX_LENGTH DESC
LIMIT 100;
