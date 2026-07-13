-- 第二课：检查 PostgreSQL 当前连接、schema 搜索路径与可见表。
-- 安全说明：本脚本只读取会话信息和 information_schema，不修改数据或结构。

SELECT
  current_setting('server_version') AS server_version,
  current_database() AS current_database,
  current_user AS current_user,
  current_schema AS current_schema;

SHOW search_path;

SELECT
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;
