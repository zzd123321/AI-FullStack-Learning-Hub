-- 第十课 MySQL 8.4：读取估算与实际执行计划。
-- 安全说明：只创建会话临时表和索引，ANALYZE 只执行 SELECT。

CREATE TEMPORARY TABLE learning_accounts (
  id BIGINT PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  region VARCHAR(20) NOT NULL
) ENGINE = InnoDB;

CREATE TEMPORARY TABLE learning_orders (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL
) ENGINE = InnoDB;

INSERT INTO learning_accounts (id, display_name, region)
SELECT n, CONCAT('account-', n),
  CASE MOD(n, 4) WHEN 0 THEN 'east' WHEN 1 THEN 'west'
    WHEN 2 THEN 'north' ELSE 'south' END
FROM (
  SELECT ones.d + tens.d * 10 + 1 AS n
  FROM (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
  CROSS JOIN
       (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
) numbers
WHERE n <= 97;

INSERT INTO learning_orders (id, account_id, status, amount, created_at)
SELECT n, MOD(n, 97) + 1,
  CASE WHEN MOD(n, 10) < 6 THEN 'paid'
       WHEN MOD(n, 10) < 8 THEN 'pending'
       WHEN MOD(n, 10) = 8 THEN 'shipped' ELSE 'cancelled' END,
  (MOD(n, 50000) + 100) / 100.0,
  TIMESTAMP('2026-01-01 00:00:00') + INTERVAL n MINUTE
FROM (
  SELECT ones.d + tens.d*10 + hundreds.d*100 + thousands.d*1000 + 1 AS n
  FROM (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) hundreds
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) thousands
) numbers;

CREATE INDEX idx_plan_orders_account_status_created
ON learning_orders (account_id, status, created_at DESC, id DESC, amount);

ANALYZE TABLE learning_accounts, learning_orders;

SELECT COUNT(*) row_count, COUNT(DISTINCT account_id) account_count
FROM learning_orders;

EXPLAIN FORMAT = TRADITIONAL
SELECT id, amount, created_at FROM learning_orders
WHERE account_id = 42 AND status = 'paid'
  AND created_at >= '2026-01-02 00:00:00'
ORDER BY created_at DESC, id DESC LIMIT 20;

EXPLAIN FORMAT = TREE
SELECT id, amount, created_at FROM learning_orders
WHERE account_id = 42 AND status = 'paid'
  AND created_at >= '2026-01-02 00:00:00'
ORDER BY created_at DESC, id DESC LIMIT 20;

EXPLAIN ANALYZE FORMAT = TREE
SELECT id, amount, created_at FROM learning_orders
WHERE account_id = 42 AND status = 'paid'
  AND created_at >= '2026-01-02 00:00:00'
ORDER BY created_at DESC, id DESC LIMIT 20;

EXPLAIN ANALYZE FORMAT = TREE
SELECT a.id, a.display_name, o.id order_id, o.amount
FROM learning_orders o
JOIN learning_accounts a ON a.id = o.account_id
WHERE o.status = 'paid' AND a.region = 'east'
ORDER BY o.created_at DESC, o.id DESC LIMIT 20;

EXPLAIN ANALYZE FORMAT = TREE
SELECT account_id, COUNT(*) order_count, SUM(amount) total_amount
FROM learning_orders
WHERE status = 'paid'
GROUP BY account_id
ORDER BY order_count DESC, account_id;
