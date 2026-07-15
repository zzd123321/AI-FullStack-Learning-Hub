-- 第 18 课 MySQL 8.4：只读复制诊断。
-- 在 source 上部分复制表可能为空；在 replica 上可观察 receiver/applier。

SELECT
  VERSION() AS mysql_version,
  @@server_uuid AS server_uuid,
  @@hostname AS host_name,
  @@read_only AS read_only,
  @@super_read_only AS super_read_only,
  @@gtid_mode AS gtid_mode,
  @@enforce_gtid_consistency AS enforce_gtid_consistency;

-- Receiver/I/O thread 与已接收 GTID 集合。
SELECT
  CHANNEL_NAME,
  SOURCE_UUID,
  SERVICE_STATE,
  RECEIVED_TRANSACTION_SET,
  LAST_ERROR_NUMBER,
  LEFT(LAST_ERROR_MESSAGE, 300) AS last_error_message,
  LAST_ERROR_TIMESTAMP
FROM performance_schema.replication_connection_status
ORDER BY CHANNEL_NAME;

-- Coordinator 状态和最近错误。
SELECT
  CHANNEL_NAME,
  THREAD_ID,
  SERVICE_STATE,
  LAST_ERROR_NUMBER,
  LEFT(LAST_ERROR_MESSAGE, 300) AS last_error_message,
  LAST_ERROR_TIMESTAMP
FROM performance_schema.replication_applier_status_by_coordinator
ORDER BY CHANNEL_NAME;

-- 并行 apply worker。单 worker 错误可能被聚合视图掩盖。
SELECT
  CHANNEL_NAME,
  WORKER_ID,
  THREAD_ID,
  SERVICE_STATE,
  LAST_APPLIED_TRANSACTION,
  LAST_APPLIED_TRANSACTION_END_APPLY_TIMESTAMP,
  APPLYING_TRANSACTION,
  APPLYING_TRANSACTION_START_APPLY_TIMESTAMP,
  LAST_ERROR_NUMBER,
  LEFT(LAST_ERROR_MESSAGE, 300) AS last_error_message
FROM performance_schema.replication_applier_status_by_worker
ORDER BY CHANNEL_NAME, WORKER_ID;

-- 全局已执行 GTID；与 receiver 的 retrieved set 组合判断待 apply 工作。
SELECT @@global.gtid_executed AS executed_gtid_set,
       @@global.gtid_purged AS purged_gtid_set;

-- 半同步插件可能未安装；只查询状态，不执行安装或启用。
SELECT
  PLUGIN_NAME,
  PLUGIN_STATUS,
  PLUGIN_VERSION
FROM information_schema.plugins
WHERE PLUGIN_NAME IN ('rpl_semi_sync_source', 'rpl_semi_sync_replica')
ORDER BY PLUGIN_NAME;

-- 适合人工检查的兼容视图；source 上通常返回空结果。
SHOW REPLICA STATUS;
