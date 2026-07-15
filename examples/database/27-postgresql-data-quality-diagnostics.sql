-- PostgreSQL 18 数据质量元数据盘点：全部为只读查询。
-- 请使用只能读取系统目录的最小权限角色执行。

-- 1. 约束类型、验证状态和延迟检查属性。
SELECT namespace.nspname AS schema_name,
       relation.relname AS table_name,
       constraint_record.conname AS constraint_name,
       CASE constraint_record.contype
         WHEN 'p' THEN 'PRIMARY KEY'
         WHEN 'u' THEN 'UNIQUE'
         WHEN 'f' THEN 'FOREIGN KEY'
         WHEN 'c' THEN 'CHECK'
         WHEN 'x' THEN 'EXCLUSION'
         WHEN 'n' THEN 'NOT NULL'
         ELSE constraint_record.contype::text
       END AS constraint_type,
       constraint_record.convalidated,
       constraint_record.condeferrable,
       constraint_record.condeferred
FROM pg_constraint AS constraint_record
JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY namespace.nspname, relation.relname, constraint_record.contype, constraint_record.conname;

-- 2. NOT VALID 约束尚未证明全部历史行满足规则，应安排独立验证窗口。
SELECT namespace.nspname AS schema_name,
       relation.relname AS table_name,
       constraint_record.conname AS constraint_name,
       pg_get_constraintdef(constraint_record.oid) AS definition
FROM pg_constraint AS constraint_record
JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE NOT constraint_record.convalidated
  AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY namespace.nspname, relation.relname, constraint_record.conname;

-- 3. 普通/分区表没有主键会增加 CDC、稳定分块和精确修复的难度。
SELECT namespace.nspname AS schema_name, relation.relname AS table_name,
       relation.reltuples::bigint AS estimated_rows
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE relation.relkind IN ('r', 'p')
  AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS primary_key
    WHERE primary_key.conrelid = relation.oid
      AND primary_key.contype = 'p'
  )
ORDER BY namespace.nspname, relation.relname;

-- 4. 外键定义；存在外键仍不代表跨数据库或跨服务关系已被覆盖。
SELECT namespace.nspname AS schema_name, relation.relname AS table_name,
       foreign_key.conname AS constraint_name,
       pg_get_constraintdef(foreign_key.oid) AS definition,
       foreign_key.convalidated
FROM pg_constraint AS foreign_key
JOIN pg_class AS relation ON relation.oid = foreign_key.conrelid
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE foreign_key.contype = 'f'
  AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY namespace.nspname, relation.relname, foreign_key.conname;
