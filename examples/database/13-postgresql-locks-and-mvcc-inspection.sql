-- PostgreSQL 18：只读检查当前后端与当前后端持有/等待的锁。
-- 不创建对象、不修改业务数据，也不读取其他会话的 SQL 文本。

SELECT
  version() AS postgresql_version,
  pg_backend_pid() AS backend_pid,
  current_setting('transaction_isolation') AS transaction_isolation;

BEGIN READ ONLY;

SELECT
  current_timestamp AS observed_at,
  pg_backend_pid() AS backend_pid,
  current_setting('transaction_isolation') AS transaction_isolation,
  current_setting('transaction_read_only') AS transaction_read_only;

-- pg_locks 是瞬时状态；当前后端通常至少持有关系或虚拟事务相关锁。
SELECT
  locktype,
  mode,
  granted,
  relation::regclass AS relation,
  page,
  tuple,
  virtualxid,
  transactionid
FROM pg_locks
WHERE pid = pg_backend_pid()
ORDER BY
  granted,
  locktype,
  relation::regclass::text NULLS LAST,
  mode;

-- 当前脚本没有制造阻塞，因此通常返回空数组。
SELECT pg_blocking_pids(pg_backend_pid()) AS blocking_pids;

ROLLBACK;
