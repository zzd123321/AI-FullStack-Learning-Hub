-- 只读检查 MySQL 当前隔离级别。
SELECT @@transaction_isolation AS session_isolation;
START TRANSACTION READ ONLY;
SELECT @@transaction_isolation AS transaction_isolation;
SELECT CURRENT_TIMESTAMP AS inspected_at;
ROLLBACK;
