-- 只读检查 PostgreSQL 18 的会话默认、当前值与只读事务设置。
SHOW default_transaction_isolation;
SHOW transaction_isolation;

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;

SHOW transaction_isolation;
SHOW transaction_read_only;
SELECT
  pg_backend_pid() AS backend_pid,
  CURRENT_TIMESTAMP AS inspected_at;

ROLLBACK;
