-- 第 24 课 MySQL 8.4：容量只读快照。
-- 累积计数需在两个时间点采集后求差/rate；本脚本不重置统计。

SELECT
  VERSION() AS mysql_version,
  @@hostname AS host_name,
  @@max_connections AS max_connections,
  @@innodb_buffer_pool_size AS innodb_buffer_pool_bytes,
  @@performance_schema AS performance_schema_enabled;

SELECT
  VARIABLE_NAME,
  VARIABLE_VALUE
FROM performance_schema.global_status
WHERE VARIABLE_NAME IN (
  'Uptime',
  'Threads_connected',
  'Threads_running',
  'Connections',
  'Aborted_connects',
  'Questions',
  'Queries',
  'Bytes_received',
  'Bytes_sent',
  'Created_tmp_tables',
  'Created_tmp_disk_tables',
  'Innodb_buffer_pool_read_requests',
  'Innodb_buffer_pool_reads',
  'Innodb_data_read',
  'Innodb_data_written',
  'Innodb_os_log_written'
)
ORDER BY VARIABLE_NAME;

-- 按 digest 观察累计总耗时、扫描/返回行与临时表；NULL digest 被排除。
SELECT
  SCHEMA_NAME,
  DIGEST,
  LEFT(DIGEST_TEXT, 300) AS digest_text,
  COUNT_STAR,
  ROUND(SUM_TIMER_WAIT / 1000000000000, 3) AS total_seconds,
  ROUND(AVG_TIMER_WAIT / 1000000000, 3) AS average_milliseconds,
  SUM_ROWS_EXAMINED,
  SUM_ROWS_SENT,
  SUM_CREATED_TMP_DISK_TABLES,
  SUM_ERRORS,
  SUM_WARNINGS,
  FIRST_SEEN,
  LAST_SEEN
FROM performance_schema.events_statements_summary_by_digest
WHERE DIGEST IS NOT NULL
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 50;

-- TABLE_ROWS 对 InnoDB 通常是估算值，适合趋势而非精确迁移校验。
SELECT
  TABLE_SCHEMA,
  SUM(TABLE_ROWS) AS estimated_rows,
  SUM(DATA_LENGTH) AS data_bytes,
  SUM(INDEX_LENGTH) AS index_bytes,
  SUM(DATA_FREE) AS data_free_bytes
FROM information_schema.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
GROUP BY TABLE_SCHEMA
ORDER BY data_bytes + index_bytes DESC;
