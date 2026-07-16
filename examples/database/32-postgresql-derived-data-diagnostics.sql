-- PostgreSQL 18：只读盘点普通视图、物化视图、索引和生成列。
-- 目录视图只展示当前角色可见的对象；请使用应用运行角色验证。

SELECT
  schemaname,
  viewname,
  viewowner
FROM pg_catalog.pg_views
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, viewname;

SELECT
  schemaname,
  matviewname,
  matviewowner,
  ispopulated,
  hasindexes
FROM pg_catalog.pg_matviews
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, matviewname;

-- 检查物化视图是否具备有效、非部分的普通列唯一索引候选。
-- REFRESH ... CONCURRENTLY 的完整资格仍应以目标版本文档和实际命令验证。
SELECT
  namespace.nspname AS schema_name,
  relation.relname AS materialized_view,
  index_relation.relname AS index_name,
  index_meta.indisunique,
  index_meta.indisvalid,
  index_meta.indpred IS NULL AS is_not_partial,
  index_meta.indexprs IS NULL AS has_no_expressions
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
JOIN pg_catalog.pg_index AS index_meta
  ON index_meta.indrelid = relation.oid
JOIN pg_catalog.pg_class AS index_relation
  ON index_relation.oid = index_meta.indexrelid
WHERE relation.relkind = 'm'
  AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY namespace.nspname, relation.relname, index_relation.relname;

SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_generated,
  generation_expression
FROM information_schema.columns
WHERE is_generated <> 'NEVER'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, ordinal_position;

-- 估算物化视图及其全部索引占用的总空间。
SELECT
  namespace.nspname AS schema_name,
  relation.relname AS materialized_view,
  pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(relation.oid)) AS total_size
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
WHERE relation.relkind = 'm'
  AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_catalog.pg_total_relation_size(relation.oid) DESC;
