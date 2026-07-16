-- PostgreSQL 18：只读盘点 json/jsonb 列、相关索引和基础统计。

SELECT
  namespace.nspname AS schema_name,
  relation.relname AS table_name,
  attribute.attname AS column_name,
  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
  attribute.attnotnull AS is_not_null
FROM pg_catalog.pg_attribute AS attribute
JOIN pg_catalog.pg_class AS relation
  ON relation.oid = attribute.attrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
WHERE relation.relkind IN ('r', 'p')
  AND attribute.attnum > 0
  AND NOT attribute.attisdropped
  AND attribute.atttypid IN ('json'::regtype, 'jsonb'::regtype)
  AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY namespace.nspname, relation.relname, attribute.attnum;

-- 只列 JSON 表上的索引元数据和 operator class，不输出完整 index expression。
SELECT
  namespace.nspname AS schema_name,
  table_relation.relname AS table_name,
  index_relation.relname AS index_name,
  access_method.amname AS access_method,
  index_meta.indisunique AS is_unique,
  index_meta.indisvalid AS is_valid,
  index_meta.indisready AS is_ready,
  index_meta.indexprs IS NOT NULL AS has_expression,
  index_meta.indpred IS NOT NULL AS is_partial,
  array_agg(operator_class.opcname ORDER BY operator_position.ordinality) AS operator_classes
FROM pg_catalog.pg_index AS index_meta
JOIN pg_catalog.pg_class AS table_relation
  ON table_relation.oid = index_meta.indrelid
JOIN pg_catalog.pg_class AS index_relation
  ON index_relation.oid = index_meta.indexrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = table_relation.relnamespace
JOIN pg_catalog.pg_am AS access_method
  ON access_method.oid = index_relation.relam
LEFT JOIN LATERAL unnest(index_meta.indclass::oid[]) WITH ORDINALITY
  AS operator_position(operator_class_oid, ordinality) ON true
LEFT JOIN pg_catalog.pg_opclass AS operator_class
  ON operator_class.oid = operator_position.operator_class_oid
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS json_attribute
    WHERE json_attribute.attrelid = table_relation.oid
      AND json_attribute.attnum > 0
      AND NOT json_attribute.attisdropped
      AND json_attribute.atttypid IN ('json'::regtype, 'jsonb'::regtype)
  )
GROUP BY
  namespace.nspname,
  table_relation.relname,
  index_relation.relname,
  access_method.amname,
  index_meta.indisunique,
  index_meta.indisvalid,
  index_meta.indisready,
  (index_meta.indexprs IS NOT NULL),
  (index_meta.indpred IS NOT NULL)
ORDER BY namespace.nspname, table_relation.relname, index_relation.relname;

SELECT
  schemaname,
  tablename,
  attname AS column_name,
  null_frac,
  avg_width,
  n_distinct
FROM pg_catalog.pg_stats
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND (schemaname, tablename, attname) IN (
    SELECT
      namespace.nspname,
      relation.relname,
      attribute.attname
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.atttypid IN ('json'::regtype, 'jsonb'::regtype)
  )
ORDER BY schemaname, tablename, attname;
