-- 第 19 课 MySQL 8.4：只读分区诊断。
-- 所有可执行语句仅查询元数据，不创建、改动或删除业务对象。

SELECT
  VERSION() AS mysql_version,
  @@session.time_zone AS session_time_zone,
  @@global.time_zone AS global_time_zone;

-- 查看已分区表、分区方法、边界和估算大小。
-- TABLE_ROWS 对 InnoDB 通常是估算值，不能用作归档完整性证明。
SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  PARTITION_NAME,
  PARTITION_ORDINAL_POSITION,
  PARTITION_METHOD,
  PARTITION_EXPRESSION,
  PARTITION_DESCRIPTION,
  TABLE_ROWS,
  DATA_LENGTH,
  INDEX_LENGTH,
  DATA_FREE,
  UPDATE_TIME
FROM information_schema.PARTITIONS
WHERE PARTITION_NAME IS NOT NULL
  AND TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, PARTITION_ORDINAL_POSITION
LIMIT 200;

-- 汇总分区数和估算容量，识别分区数量或大小异常的表。
SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  COUNT(*) AS partition_count,
  SUM(TABLE_ROWS) AS estimated_rows,
  SUM(DATA_LENGTH) AS data_bytes,
  SUM(INDEX_LENGTH) AS index_bytes,
  MAX(PARTITION_ORDINAL_POSITION) AS last_partition_position
FROM information_schema.PARTITIONS
WHERE PARTITION_NAME IS NOT NULL
  AND TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
GROUP BY TABLE_SCHEMA, TABLE_NAME
ORDER BY partition_count DESC, data_bytes DESC
LIMIT 100;

-- 下面是设计模板，只作为注释，不会被 SQL 客户端执行。
-- MySQL 的每个唯一键都必须包含分区列 created_at。
--
-- CREATE TABLE audit_events_partitioned (
--   id BIGINT NOT NULL,
--   tenant_id BIGINT NOT NULL,
--   created_at DATETIME(6) NOT NULL,
--   event_type VARCHAR(64) NOT NULL,
--   PRIMARY KEY (id, created_at),
--   KEY idx_tenant_time (tenant_id, created_at, id)
-- ) ENGINE = InnoDB
-- PARTITION BY RANGE COLUMNS (created_at) (
--   PARTITION p202601 VALUES LESS THAN ('2026-02-01 00:00:00'),
--   PARTITION p202602 VALUES LESS THAN ('2026-03-01 00:00:00')
-- );
--
-- 替换为测试表后，用 EXPLAIN 的 partitions 列验证裁剪：
-- EXPLAIN PARTITIONS
-- SELECT id, tenant_id, created_at, event_type
-- FROM audit_events_partitioned
-- WHERE tenant_id = 42
--   AND created_at >= '2026-02-01 00:00:00'
--   AND created_at <  '2026-03-01 00:00:00'
-- ORDER BY created_at DESC, id DESC
-- LIMIT 20;
