-- MySQL 8.4：只读盘点 FULLTEXT 索引和关键 parser/token 配置。

SELECT
  @@GLOBAL.innodb_ft_min_token_size AS innodb_min_token_size,
  @@GLOBAL.innodb_ft_max_token_size AS innodb_max_token_size,
  @@GLOBAL.innodb_ft_enable_stopword AS innodb_stopword_enabled,
  @@GLOBAL.innodb_ft_server_stopword_table AS innodb_server_stopword_table,
  @@GLOBAL.ngram_token_size AS ngram_token_size;

SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  INDEX_NAME,
  NON_UNIQUE,
  SEQ_IN_INDEX,
  COLUMN_NAME,
  COLLATION,
  CARDINALITY,
  IS_VISIBLE
FROM information_schema.STATISTICS
WHERE INDEX_TYPE = 'FULLTEXT'
  AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- 对照全文索引列的字符集/collation；实际 parser 还需检查 SHOW CREATE TABLE。
SELECT
  column_meta.TABLE_SCHEMA,
  column_meta.TABLE_NAME,
  column_meta.COLUMN_NAME,
  column_meta.DATA_TYPE,
  column_meta.CHARACTER_SET_NAME,
  column_meta.COLLATION_NAME
FROM information_schema.COLUMNS AS column_meta
WHERE EXISTS (
  SELECT 1
  FROM information_schema.STATISTICS AS index_meta
  WHERE index_meta.TABLE_SCHEMA = column_meta.TABLE_SCHEMA
    AND index_meta.TABLE_NAME = column_meta.TABLE_NAME
    AND index_meta.COLUMN_NAME = column_meta.COLUMN_NAME
    AND index_meta.INDEX_TYPE = 'FULLTEXT'
)
ORDER BY column_meta.TABLE_SCHEMA, column_meta.TABLE_NAME, column_meta.ORDINAL_POSITION;
