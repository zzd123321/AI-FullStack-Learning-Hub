-- MySQL 8.4 CDC 只读就绪检查；部分语句需要 REPLICATION CLIENT 权限。

-- 1. 核对 binary log、row format、row image、GTID 与日志保留。
SELECT @@global.log_bin AS log_bin,
       @@global.binlog_format AS binlog_format,
       @@global.binlog_row_image AS binlog_row_image,
       @@global.gtid_mode AS gtid_mode,
       @@global.enforce_gtid_consistency AS enforce_gtid_consistency,
       @@global.binlog_expire_logs_seconds AS binlog_expire_logs_seconds;

-- 2. 当前日志文件/位置与已执行 GTID；不能只保存机器当前时间作为 checkpoint。
SHOW BINARY LOG STATUS;

-- 3. 日志文件大小可用于估计产生速率与保留空间；结果受账号权限限制。
SHOW BINARY LOGS;

-- 4. 盘点业务表主键。CDC 对 UPDATE/DELETE 的稳定标识依赖具体 connector、
--    row image 和表结构；没有主键通常会增加定位与去重难度。
SELECT tables.TABLE_SCHEMA, tables.TABLE_NAME, tables.TABLE_ROWS,
       MAX(CASE WHEN constraints.CONSTRAINT_TYPE = 'PRIMARY KEY' THEN 1 ELSE 0 END) AS has_primary_key
FROM information_schema.TABLES AS tables
LEFT JOIN information_schema.TABLE_CONSTRAINTS AS constraints
  ON constraints.TABLE_SCHEMA = tables.TABLE_SCHEMA
 AND constraints.TABLE_NAME = tables.TABLE_NAME
WHERE tables.TABLE_TYPE = 'BASE TABLE'
  AND tables.TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
GROUP BY tables.TABLE_SCHEMA, tables.TABLE_NAME, tables.TABLE_ROWS
ORDER BY tables.TABLE_SCHEMA, tables.TABLE_NAME;
