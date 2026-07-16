-- MySQL 8.4：只读盘点视图、生成列、触发器和调度事件。
-- 先确认当前账号有权查看目标 schema；元数据本身也可能包含敏感命名。

SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  CHECK_OPTION,
  IS_UPDATABLE,
  DEFINER,
  SECURITY_TYPE
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME;

SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  COLUMN_NAME,
  DATA_TYPE,
  IS_NULLABLE,
  EXTRA,
  GENERATION_EXPRESSION
FROM information_schema.COLUMNS
WHERE EXTRA LIKE '%GENERATED%'
  AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;

-- 只列触发器元数据，不输出可能包含敏感逻辑的 ACTION_STATEMENT。
SELECT
  TRIGGER_SCHEMA,
  TRIGGER_NAME,
  EVENT_MANIPULATION,
  EVENT_OBJECT_SCHEMA,
  EVENT_OBJECT_TABLE,
  ACTION_TIMING
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
ORDER BY TRIGGER_SCHEMA, EVENT_OBJECT_TABLE, TRIGGER_NAME;

-- 若应用用 Event Scheduler 刷新汇总表，核对任务状态与最后运行时间。
SELECT
  EVENT_SCHEMA,
  EVENT_NAME,
  STATUS,
  EVENT_TYPE,
  INTERVAL_VALUE,
  INTERVAL_FIELD,
  LAST_EXECUTED
FROM information_schema.EVENTS
WHERE EVENT_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
ORDER BY EVENT_SCHEMA, EVENT_NAME;
