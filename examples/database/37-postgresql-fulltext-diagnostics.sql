-- PostgreSQL 18：只读盘点 text search 配置、相关扩展和全文索引。

SELECT
  current_setting('default_text_search_config') AS default_text_search_config;

SELECT
  namespace.nspname AS schema_name,
  config.cfgname AS configuration_name,
  parser_namespace.nspname AS parser_schema,
  parser.prsname AS parser_name,
  role_meta.rolname AS owner_name
FROM pg_catalog.pg_ts_config AS config
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = config.cfgnamespace
JOIN pg_catalog.pg_ts_parser AS parser
  ON parser.oid = config.cfgparser
JOIN pg_catalog.pg_namespace AS parser_namespace
  ON parser_namespace.oid = parser.prsnamespace
JOIN pg_catalog.pg_roles AS role_meta
  ON role_meta.oid = config.cfgowner
ORDER BY namespace.nspname, config.cfgname;

SELECT
  extension_meta.extname AS extension_name,
  extension_meta.extversion AS extension_version,
  namespace.nspname AS extension_schema
FROM pg_catalog.pg_extension AS extension_meta
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = extension_meta.extnamespace
WHERE extension_meta.extname IN ('pg_trgm', 'unaccent')
ORDER BY extension_meta.extname;

-- 输出 index definition 以核对 to_tsvector 配置与 indexed expression。
-- 定义可能包含业务列名，仅在受控诊断环境使用。
SELECT
  namespace.nspname AS schema_name,
  table_relation.relname AS table_name,
  index_relation.relname AS index_name,
  access_method.amname AS access_method,
  index_meta.indisvalid AS is_valid,
  index_meta.indisready AS is_ready,
  pg_catalog.pg_get_indexdef(index_relation.oid) AS index_definition
FROM pg_catalog.pg_index AS index_meta
JOIN pg_catalog.pg_class AS table_relation
  ON table_relation.oid = index_meta.indrelid
JOIN pg_catalog.pg_class AS index_relation
  ON index_relation.oid = index_meta.indexrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = table_relation.relnamespace
JOIN pg_catalog.pg_am AS access_method
  ON access_method.oid = index_relation.relam
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND (
    access_method.amname IN ('gin', 'gist')
    OR index_meta.indexprs IS NOT NULL
  )
  AND pg_catalog.pg_get_indexdef(index_relation.oid) ~* '(tsvector|to_tsvector|gin_trgm_ops|gist_trgm_ops)'
ORDER BY namespace.nspname, table_relation.relname, index_relation.relname;
