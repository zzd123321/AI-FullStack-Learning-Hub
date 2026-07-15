-- 第 21 课 MySQL 8.4：备份与 PITR 就绪度只读检查。
-- 不生成备份，不轮转、重置或删除 binary log。

SELECT
  VERSION() AS mysql_version,
  @@server_uuid AS server_uuid,
  @@hostname AS host_name,
  @@read_only AS read_only,
  @@super_read_only AS super_read_only,
  @@log_bin AS binary_logging_enabled,
  @@binlog_format AS binlog_format,
  @@binlog_row_image AS binlog_row_image,
  @@gtid_mode AS gtid_mode,
  @@enforce_gtid_consistency AS enforce_gtid_consistency,
  @@binlog_expire_logs_seconds AS binlog_retention_seconds,
  @@sync_binlog AS sync_binlog,
  @@innodb_flush_log_at_trx_commit AS innodb_flush_log_at_trx_commit;

-- 当前执行历史用于与备份 manifest、归档水位和恢复目标比对。
SELECT
  @@global.gtid_executed AS executed_gtid_set,
  @@global.gtid_purged AS purged_gtid_set,
  UTC_TIMESTAMP(6) AS observed_at_utc;

-- 列出当前实例仍保留的 binary log。输出是本地保留，不证明已异地归档。
SHOW BINARY LOGS;

-- 识别长事务；长一致性快照可能增加 undo/MVCC 保留与备份压力。
SELECT
  trx_id,
  trx_state,
  trx_started,
  TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS age_seconds,
  trx_mysql_thread_id,
  trx_rows_locked,
  trx_rows_modified,
  LEFT(trx_query, 300) AS current_query
FROM information_schema.INNODB_TRX
ORDER BY trx_started;
