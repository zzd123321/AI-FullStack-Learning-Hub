-- 第 20 课 MySQL 8.4：分布式事务只读诊断。
-- 不启动、提交或回滚 XA 事务。未知 prepared 事务必须交给事务协调器恢复。

SELECT
  VERSION() AS mysql_version,
  @@server_uuid AS server_uuid,
  @@hostname AS host_name,
  @@read_only AS read_only,
  @@super_read_only AS super_read_only,
  @@binlog_format AS binlog_format,
  @@gtid_mode AS gtid_mode;

-- XA RECOVER 是诊断语句，列出仍处于 PREPARED 状态的 XA 分支。
-- CONVERT XID 让可打印部分更易检查；可能需要 XA_RECOVER_ADMIN 权限。
XA RECOVER CONVERT XID;

-- 单个实例的 schema/table 容量快照。分片系统应在每个 shard 运行并集中比较，
-- INFORMATION_SCHEMA 的 TABLE_ROWS 对 InnoDB 通常为估算值，不能作为迁移校验依据。
SELECT
  TABLE_SCHEMA,
  COUNT(*) AS table_count,
  SUM(TABLE_ROWS) AS estimated_rows,
  SUM(DATA_LENGTH) AS data_bytes,
  SUM(INDEX_LENGTH) AS index_bytes
FROM information_schema.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
GROUP BY TABLE_SCHEMA
ORDER BY data_bytes DESC, TABLE_SCHEMA;

-- 查看当前实例是否存在长事务。迁移、DDL 和 XA 故障恢复前必须先解释长事务来源。
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
