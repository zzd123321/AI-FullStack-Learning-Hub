-- 第 25 课 MySQL 8.4：事故只读快照。
-- 不 kill session、不 reset 统计、不修改复制或全局参数。

SELECT VERSION(), @@server_uuid, @@hostname, @@read_only, @@super_read_only,
       @@gtid_mode, UTC_TIMESTAMP(6) AS observed_at_utc;

SELECT THREAD_ID, PROCESSLIST_ID, PROCESSLIST_USER, PROCESSLIST_HOST,
       PROCESSLIST_DB, PROCESSLIST_COMMAND, PROCESSLIST_TIME,
       PROCESSLIST_STATE, LEFT(PROCESSLIST_INFO, 300) AS current_statement
FROM performance_schema.threads
WHERE TYPE = 'FOREGROUND' AND PROCESSLIST_ID IS NOT NULL
ORDER BY PROCESSLIST_TIME DESC
LIMIT 200;

SELECT trx_id, trx_state, trx_started,
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS age_seconds,
       trx_mysql_thread_id, trx_tables_locked, trx_rows_locked,
       trx_rows_modified, LEFT(trx_query, 300) AS current_query
FROM information_schema.INNODB_TRX
ORDER BY trx_started;

SELECT OBJECT_TYPE, OBJECT_SCHEMA, OBJECT_NAME, LOCK_TYPE,
       LOCK_DURATION, LOCK_STATUS, OWNER_THREAD_ID
FROM performance_schema.metadata_locks
WHERE LOCK_STATUS = 'PENDING'
ORDER BY OBJECT_SCHEMA, OBJECT_NAME;

SELECT REQUESTING_ENGINE_TRANSACTION_ID, REQUESTING_ENGINE_LOCK_ID,
       BLOCKING_ENGINE_TRANSACTION_ID, BLOCKING_ENGINE_LOCK_ID
FROM performance_schema.data_lock_waits;

SELECT CHANNEL_NAME, SERVICE_STATE, LAST_ERROR_NUMBER,
       LEFT(LAST_ERROR_MESSAGE, 300) AS last_error_message,
       LAST_ERROR_TIMESTAMP
FROM performance_schema.replication_applier_status_by_coordinator
ORDER BY CHANNEL_NAME;

SELECT CHANNEL_NAME, WORKER_ID, SERVICE_STATE, LAST_APPLIED_TRANSACTION,
       APPLYING_TRANSACTION, LAST_ERROR_NUMBER,
       LEFT(LAST_ERROR_MESSAGE, 300) AS last_error_message
FROM performance_schema.replication_applier_status_by_worker
ORDER BY CHANNEL_NAME, WORKER_ID;

-- error_log 是有限内存 ring buffer，是否有数据取决于 server log sink 配置。
SELECT LOGGED, THREAD_ID, PRIO, ERROR_CODE, SUBSYSTEM, LEFT(DATA, 500) AS message
FROM performance_schema.error_log
ORDER BY LOGGED DESC
LIMIT 100;
