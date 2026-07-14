-- MySQL 8.4：只读检查当前连接与当前连接持有/等待的数据锁。
-- 不创建对象、不修改业务数据。data_locks 为空表示当前连接没有数据锁。

SELECT
  VERSION() AS mysql_version,
  CONNECTION_ID() AS connection_id,
  @@transaction_isolation AS transaction_isolation,
  @@autocommit AS autocommit;

-- 找到 Performance Schema 中与当前客户端连接对应的线程。
SELECT
  THREAD_ID,
  PROCESSLIST_ID,
  PROCESSLIST_USER,
  PROCESSLIST_DB,
  PROCESSLIST_COMMAND,
  PROCESSLIST_STATE
FROM performance_schema.threads
WHERE PROCESSLIST_ID = CONNECTION_ID();

-- 只查看当前连接的数据锁；普通快照读通常不会产生这里可见的行锁。
SELECT
  dl.ENGINE,
  dl.OBJECT_SCHEMA,
  dl.OBJECT_NAME,
  dl.INDEX_NAME,
  dl.LOCK_TYPE,
  dl.LOCK_MODE,
  dl.LOCK_STATUS,
  dl.LOCK_DATA
FROM performance_schema.data_locks AS dl
JOIN performance_schema.threads AS th
  ON th.THREAD_ID = dl.THREAD_ID
WHERE th.PROCESSLIST_ID = CONNECTION_ID()
ORDER BY
  dl.OBJECT_SCHEMA,
  dl.OBJECT_NAME,
  dl.INDEX_NAME,
  dl.LOCK_TYPE,
  dl.LOCK_MODE;

-- 只读事务用于验证事务边界，随后显式回滚。
START TRANSACTION READ ONLY;

SELECT
  CURRENT_TIMESTAMP AS observed_at,
  CONNECTION_ID() AS connection_id,
  @@transaction_isolation AS transaction_isolation;

ROLLBACK;
