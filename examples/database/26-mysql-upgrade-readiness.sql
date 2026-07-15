-- MySQL 8.4 升级只读快照；不能替代 MySQL Shell Upgrade Checker。
SELECT VERSION(), @@version_compile_os, @@version_compile_machine,
       @@sql_mode, @@character_set_server, @@collation_server,
       @@lower_case_table_names;
SELECT PLUGIN_NAME, PLUGIN_VERSION, PLUGIN_STATUS, PLUGIN_TYPE, PLUGIN_LIBRARY
FROM information_schema.PLUGINS ORDER BY PLUGIN_TYPE, PLUGIN_NAME;
SELECT TABLE_SCHEMA, ENGINE, COUNT(*) AS table_count,
       SUM(DATA_LENGTH + INDEX_LENGTH) AS total_bytes
FROM information_schema.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
GROUP BY TABLE_SCHEMA, ENGINE ORDER BY total_bytes DESC;
SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE, SQL_MODE
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA NOT IN ('mysql', 'sys')
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME;
