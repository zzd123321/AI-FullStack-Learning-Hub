-- 第 17 课 PostgreSQL 18：连接与 timeout 检查。
-- 只读取全局状态；SET LOCAL 仅在演示事务内有效，随后 ROLLBACK。

SELECT
  version() AS postgresql_version,
  pg_backend_pid() AS current_backend_pid,
  current_user AS authenticated_role,
  current_database() AS database_name;

SELECT
  current_setting('max_connections') AS max_connections,
  current_setting('reserved_connections') AS reserved_connections,
  current_setting('superuser_reserved_connections')
    AS superuser_reserved_connections,
  current_setting('statement_timeout') AS statement_timeout,
  current_setting('lock_timeout') AS lock_timeout,
  current_setting('idle_in_transaction_session_timeout')
    AS idle_in_transaction_session_timeout,
  current_setting('transaction_timeout') AS transaction_timeout;

-- 按状态观察 client backend。其他用户 query 文本可能因权限被隐藏。
SELECT
  state,
  wait_event_type,
  COUNT(*) AS connections
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state, wait_event_type
ORDER BY state, wait_event_type;

-- 事务局部预算：ROLLBACK 后自动恢复，不污染连接池中的下一位调用者。
BEGIN;
SET LOCAL statement_timeout = '500ms';
SET LOCAL lock_timeout = '100ms';
SET LOCAL idle_in_transaction_session_timeout = '1s';
SET LOCAL transaction_timeout = '2s';

SELECT
  current_setting('statement_timeout') AS local_statement_timeout,
  current_setting('lock_timeout') AS local_lock_timeout,
  current_setting('idle_in_transaction_session_timeout')
    AS local_idle_in_transaction_timeout,
  current_setting('transaction_timeout') AS local_transaction_timeout;

SELECT COUNT(*) AS generated_rows
FROM generate_series(1, 1000);

ROLLBACK;

SELECT
  current_setting('statement_timeout') AS restored_statement_timeout,
  current_setting('lock_timeout') AS restored_lock_timeout,
  current_setting('idle_in_transaction_session_timeout')
    AS restored_idle_in_transaction_timeout,
  current_setting('transaction_timeout') AS restored_transaction_timeout;
