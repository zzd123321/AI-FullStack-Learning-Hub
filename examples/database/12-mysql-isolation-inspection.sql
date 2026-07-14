-- 只读检查 MySQL 8.4 的全局默认和当前会话设置，并声明只读事务。
SELECT
  @@GLOBAL.transaction_isolation AS global_default_isolation,
  @@SESSION.transaction_isolation AS session_isolation,
  @@SESSION.autocommit AS session_autocommit;

START TRANSACTION READ ONLY;

SELECT
  @@SESSION.transaction_isolation AS transaction_isolation,
  CURRENT_TIMESTAMP AS inspected_at;

ROLLBACK;
