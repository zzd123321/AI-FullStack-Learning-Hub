-- MySQL 8.4：只读盘点 JSON 列、生成列和相关索引。

SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  COLUMN_NAME,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  CHARACTER_SET_NAME,
  COLLATION_NAME
FROM information_schema.COLUMNS
WHERE DATA_TYPE = 'json'
  AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;

-- 生成表达式可能包含业务路径；仅在受控诊断环境输出。
SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  COLUMN_NAME,
  DATA_TYPE,
  EXTRA,
  GENERATION_EXPRESSION
FROM information_schema.COLUMNS
WHERE EXTRA LIKE '%GENERATED%'
  AND GENERATION_EXPRESSION IS NOT NULL
  AND GENERATION_EXPRESSION <> ''
  AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;

-- COLUMN_NAME 为空而 EXPRESSION 非空时通常表示函数/表达式索引部分。
SELECT
  index_meta.TABLE_SCHEMA,
  index_meta.TABLE_NAME,
  index_meta.INDEX_NAME,
  index_meta.NON_UNIQUE,
  index_meta.SEQ_IN_INDEX,
  index_meta.COLUMN_NAME,
  index_meta.EXPRESSION,
  index_meta.COLLATION,
  index_meta.CARDINALITY,
  index_meta.IS_VISIBLE
FROM information_schema.STATISTICS AS index_meta
WHERE index_meta.TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
  AND (
    LOWER(COALESCE(index_meta.EXPRESSION, '')) LIKE '%json_%'
    OR EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS AS generated_column
      WHERE generated_column.TABLE_SCHEMA = index_meta.TABLE_SCHEMA
        AND generated_column.TABLE_NAME = index_meta.TABLE_NAME
        AND generated_column.COLUMN_NAME = index_meta.COLUMN_NAME
        AND generated_column.EXTRA LIKE '%GENERATED%'
    )
  )
ORDER BY
  index_meta.TABLE_SCHEMA,
  index_meta.TABLE_NAME,
  index_meta.INDEX_NAME,
  index_meta.SEQ_IN_INDEX;
