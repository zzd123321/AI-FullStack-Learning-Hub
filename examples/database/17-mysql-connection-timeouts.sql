-- 第 17 课 MySQL 8.4：连接与 timeout 检查。
-- 只读取全局状态；修改仅限当前 session，并在末尾恢复。

SELECT
  VERSION() AS mysql_version,
  CONNECTION_ID() AS current_connection_id,
  CURRENT_USER() AS authenticated_account;

SELECT
  @@global.max_connections AS max_connections,
  @@global.wait_timeout AS global_wait_timeout_seconds,
  @@session.wait_timeout AS session_wait_timeout_seconds,
  @@session.max_execution_time AS session_select_timeout_ms,
  @@session.innodb_lock_wait_timeout AS session_row_lock_timeout_seconds;

SHOW GLOBAL STATUS WHERE Variable_name IN (
  'Threads_connected',
  'Threads_running',
  'Connections',
  'Aborted_connects',
  'Connection_errors_max_connections',
  'Max_used_connections'
);

-- 按数据库账号观察当前/累计连接。需要相应 Performance Schema 权限。
SELECT
  USER,
  CURRENT_CONNECTIONS,
  TOTAL_CONNECTIONS
FROM performance_schema.users
WHERE USER IS NOT NULL
ORDER BY CURRENT_CONNECTIONS DESC, USER;

-- 保存当前 session 值，演示后恢复；不影响其他连接。
SET @learning_original_max_execution_time = @@session.max_execution_time;
SET @learning_original_lock_wait_timeout = @@session.innodb_lock_wait_timeout;

SET SESSION max_execution_time = 500;
SET SESSION innodb_lock_wait_timeout = 2;

SELECT
  @@session.max_execution_time AS learning_select_timeout_ms,
  @@session.innodb_lock_wait_timeout AS learning_row_lock_timeout_seconds;

-- 该 hint 只约束本条只读 SELECT；并不约束写语句或整个事务。
SELECT /*+ MAX_EXECUTION_TIME(200) */ COUNT(*) AS generated_rows
FROM JSON_TABLE(
  JSON_ARRAY(1, 2, 3, 4, 5),
  '$[*]' COLUMNS(value INT PATH '$')
) AS learning_values;

SET SESSION max_execution_time = @learning_original_max_execution_time;
SET SESSION innodb_lock_wait_timeout = @learning_original_lock_wait_timeout;

SELECT
  @@session.max_execution_time AS restored_select_timeout_ms,
  @@session.innodb_lock_wait_timeout AS restored_row_lock_timeout_seconds;
