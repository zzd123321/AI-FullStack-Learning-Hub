-- 只读检查 PostgreSQL 当前隔离级别。
SHOW transaction_isolation;
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SHOW transaction_isolation;
SELECT CURRENT_TIMESTAMP AS inspected_at;
ROLLBACK;
