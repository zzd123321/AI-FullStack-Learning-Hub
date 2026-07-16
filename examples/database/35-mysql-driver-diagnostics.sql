-- MySQL 8.4：只读检查 prepared statement 使用与归一化语句统计。
-- 需要 performance_schema 可用且当前账号拥有相应只读权限。

SELECT
  @@GLOBAL.max_prepared_stmt_count AS max_prepared_statements,
  @@SESSION.time_zone AS session_time_zone,
  @@SESSION.character_set_client AS character_set_client,
  @@SESSION.collation_connection AS collation_connection,
  @@SESSION.transaction_isolation AS transaction_isolation;

-- 不输出 SQL_TEXT，避免诊断结果携带敏感对象名或意外常量。
SELECT
  OWNER_THREAD_ID,
  STATEMENT_ID,
  STATEMENT_NAME,
  COUNT_REPREPARE,
  COUNT_EXECUTE,
  ROUND(SUM_TIMER_EXECUTE / 1000000000000, 6) AS total_execute_seconds,
  SUM_LOCK_TIME,
  SUM_ROWS_AFFECTED,
  SUM_ROWS_SENT
FROM performance_schema.prepared_statements_instances
ORDER BY SUM_TIMER_EXECUTE DESC
LIMIT 100;

-- DIGEST_TEXT 也被省略；用 DIGEST 与应用 operation name/安全日志关联。
SELECT
  SCHEMA_NAME,
  DIGEST,
  COUNT_STAR,
  ROUND(SUM_TIMER_WAIT / 1000000000000, 6) AS total_seconds,
  ROUND(AVG_TIMER_WAIT / 1000000000000, 6) AS average_seconds,
  SUM_ROWS_EXAMINED,
  SUM_ROWS_SENT,
  SUM_CREATED_TMP_DISK_TABLES,
  SUM_ERRORS,
  SUM_WARNINGS
FROM performance_schema.events_statements_summary_by_digest
WHERE DIGEST IS NOT NULL
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 100;
