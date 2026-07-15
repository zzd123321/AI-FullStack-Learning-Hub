-- 第 16 课 MySQL 8.4：SQL 与索引优化。
-- 只创建会话临时表；EXPLAIN ANALYZE 只执行 SELECT。

CREATE TEMPORARY TABLE learning_orders (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  note VARCHAR(200) NOT NULL
) ENGINE = InnoDB;

INSERT INTO learning_orders
  (id, account_id, status, amount, created_at, note)
SELECT
  n,
  MOD(n, 97) + 1,
  CASE
    WHEN MOD(n, 10) < 6 THEN 'paid'
    WHEN MOD(n, 10) < 8 THEN 'pending'
    WHEN MOD(n, 10) = 8 THEN 'shipped'
    ELSE 'cancelled'
  END,
  (MOD(n, 50000) + 100) / 100.0,
  TIMESTAMP('2026-01-01 00:00:00') + INTERVAL n MINUTE,
  CONCAT('learning-order-', n)
FROM (
  SELECT ones.d + tens.d * 10 + hundreds.d * 100
       + thousands.d * 1000 + 1 AS n
  FROM (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
  CROSS JOIN
       (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
  CROSS JOIN
       (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) hundreds
  CROSS JOIN
       (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) thousands
) AS sequence;

-- 为完整列表查询形状服务。amount 放在尾部以创造覆盖机会；
-- 生产是否值得这样做，必须测量索引大小和写入成本。
CREATE INDEX idx_learning_orders_list_cover
ON learning_orders
  (account_id, status, created_at DESC, id DESC, amount);

ANALYZE TABLE learning_orders;

-- 1. 函数包裹索引列：语义正确，但普通 created_at 索引难形成日期范围。
EXPLAIN ANALYZE
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND DATE(created_at) = '2026-01-05'
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 2. 半开区间：保持同一自然日语义，并形成可搜索范围。
EXPLAIN ANALYZE
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND created_at >= '2026-01-05 00:00:00'
  AND created_at <  '2026-01-06 00:00:00'
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 3. 深 OFFSET：数据库仍需走过并丢弃前面的匹配行。
EXPLAIN ANALYZE
SELECT id, amount, created_at
FROM learning_orders
WHERE status = 'paid'
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 3000;

-- 4. Keyset：从上一页最后排序键继续；游标值为演示常量。
EXPLAIN ANALYZE
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND (created_at, id) < (TIMESTAMP('2026-01-07 00:00:00'), 8640)
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 5. 检查索引元数据。临时表关闭连接后自动删除。
SHOW INDEX FROM learning_orders;
