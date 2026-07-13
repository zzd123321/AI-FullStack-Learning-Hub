-- 第二课：检查 MySQL 当前连接与可见表。
-- 安全说明：本脚本只读取会话信息和 information_schema，不修改数据或结构。

SELECT
  VERSION() AS server_version,
  DATABASE() AS current_database,
  CURRENT_USER() AS authenticated_account;

SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;
