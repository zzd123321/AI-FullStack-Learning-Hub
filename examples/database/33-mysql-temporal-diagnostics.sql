-- MySQL 8.4：只读检查时间配置、时间列及疑似有效区间重叠。

SELECT
  @@GLOBAL.time_zone AS global_time_zone,
  @@SESSION.time_zone AS session_time_zone,
  @@SYSTEM_TIME_ZONE AS system_time_zone,
  NOW(6) AS session_now,
  UTC_TIMESTAMP(6) AS utc_now;

SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  COLUMN_NAME,
  DATA_TYPE,
  DATETIME_PRECISION,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  EXTRA
FROM information_schema.COLUMNS
WHERE DATA_TYPE IN ('date', 'datetime', 'timestamp', 'time', 'year')
  AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;

-- 将表名和业务键替换为目标历史表后运行；查询本身不修改数据。
-- 半开区间重叠条件：a.start < b.end 且 b.start < a.end。
SELECT
  a.product_id,
  a.id AS left_version_id,
  b.id AS right_version_id,
  a.valid_from AS left_from,
  a.valid_to AS left_to,
  b.valid_from AS right_from,
  b.valid_to AS right_to
FROM product_price_history AS a
JOIN product_price_history AS b
  ON b.product_id = a.product_id
 AND b.id > a.id
 AND a.valid_from < COALESCE(b.valid_to, '9999-12-31 23:59:59.999999')
 AND b.valid_from < COALESCE(a.valid_to, '9999-12-31 23:59:59.999999')
ORDER BY a.product_id, a.valid_from, b.valid_from;
