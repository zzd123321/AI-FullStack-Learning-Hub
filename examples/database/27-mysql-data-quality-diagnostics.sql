-- MySQL 8.4 数据质量元数据盘点：全部为只读查询。
-- 请使用只能读取 information_schema 的最小权限账号执行。

-- 1. 约束清单；CHECK 的 ENFORCED 可识别“已声明但未强制执行”。
SELECT TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE, ENFORCED
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_TYPE, CONSTRAINT_NAME;

-- 2. 单独列出未强制执行的 CHECK。它们不能阻止不符合规则的新写入。
SELECT TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_TYPE = 'CHECK'
  AND ENFORCED = 'NO'
  AND TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME;

-- 3. 普通表没有主键会增加 CDC、稳定分块和精确修复的难度。
SELECT tables.TABLE_SCHEMA, tables.TABLE_NAME, tables.ENGINE, tables.TABLE_ROWS
FROM information_schema.TABLES AS tables
LEFT JOIN information_schema.TABLE_CONSTRAINTS AS constraints
  ON constraints.TABLE_SCHEMA = tables.TABLE_SCHEMA
 AND constraints.TABLE_NAME = tables.TABLE_NAME
 AND constraints.CONSTRAINT_TYPE = 'PRIMARY KEY'
WHERE tables.TABLE_TYPE = 'BASE TABLE'
  AND tables.TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
  AND constraints.CONSTRAINT_NAME IS NULL
ORDER BY tables.TABLE_SCHEMA, tables.TABLE_NAME;

-- 4. 外键关系及更新/删除动作；盘点结果仍需与业务不变量逐项核对。
SELECT constraints.CONSTRAINT_SCHEMA, constraints.TABLE_NAME,
       constraints.CONSTRAINT_NAME, constraints.UNIQUE_CONSTRAINT_SCHEMA,
       constraints.REFERENCED_TABLE_NAME,
       constraints.UPDATE_RULE, constraints.DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS AS constraints
WHERE constraints.CONSTRAINT_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY constraints.CONSTRAINT_SCHEMA, constraints.TABLE_NAME, constraints.CONSTRAINT_NAME;
