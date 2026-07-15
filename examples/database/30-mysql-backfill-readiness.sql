-- MySQL 8.4 在线回填只读基线；请在 canary 前后用同一口径比较。

-- 1. 版本、隔离级别、持久性与日志容量配置。
SELECT VERSION() AS version,
       @@global.transaction_isolation AS transaction_isolation,
       @@global.innodb_flush_log_at_trx_commit AS flush_at_commit,
       @@global.sync_binlog AS sync_binlog,
       @@global.innodb_redo_log_capacity AS redo_log_capacity,
       @@global.binlog_expire_logs_seconds AS binlog_retention_seconds;

-- 2. 目标表规模与索引空间；TABLE_ROWS 对 InnoDB 通常是估算值。
SELECT TABLE_SCHEMA, TABLE_NAME, ENGINE, TABLE_ROWS,
       DATA_LENGTH, INDEX_LENGTH, DATA_FREE
FROM information_schema.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY DATA_LENGTH + INDEX_LENGTH DESC;

-- 3. 索引列顺序，核对 keyset 和条件更新能否使用稳定访问路径。
SELECT TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, NON_UNIQUE,
       SEQ_IN_INDEX, COLUMN_NAME, COLLATION, CARDINALITY
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- 4. 回填前后对比行锁、redo、buffer pool 与 history list 压力信号。
SHOW GLOBAL STATUS WHERE Variable_name IN (
  'Innodb_history_list_length',
  'Innodb_row_lock_current_waits',
  'Innodb_row_lock_time',
  'Innodb_rows_updated',
  'Innodb_os_log_written',
  'Innodb_buffer_pool_wait_free'
);

-- 5. 副本/applier 线程状态；具体 lag 口径需结合拓扑和 GTID 水位。
SELECT CHANNEL_NAME, SERVICE_STATE, THREAD_ID, LAST_ERROR_NUMBER, LAST_ERROR_MESSAGE
FROM performance_schema.replication_applier_status_by_worker
ORDER BY CHANNEL_NAME, WORKER_ID;
