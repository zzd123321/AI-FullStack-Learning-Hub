-- 第九课 MySQL 8.4：B-Tree、联合索引与查询形状。
-- 安全说明：只创建当前会话临时表及临时表上的索引。

CREATE TEMPORARY TABLE learning_orders (
  id BIGINT NOT NULL PRIMARY KEY,
  account_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  CONSTRAINT chk_learning_orders_amount CHECK (amount >= 0)
) ENGINE = InnoDB;

-- 通过 4 组十进制数字交叉连接生成 1 到 10,000。
INSERT INTO learning_orders (
  id,
  account_id,
  status,
  amount,
  created_at
)
SELECT
  numbers.n,
  MOD(numbers.n, 97) + 1 AS account_id,
  CASE MOD(numbers.n, 4)
    WHEN 0 THEN 'pending'
    WHEN 1 THEN 'paid'
    WHEN 2 THEN 'shipped'
    ELSE 'cancelled'
  END AS status,
  (MOD(numbers.n, 50000) + 100) / 100.0 AS amount,
  TIMESTAMP('2026-01-01 00:00:00')
    + INTERVAL numbers.n MINUTE AS created_at
FROM (
  SELECT
    ones.d
      + tens.d * 10
      + hundreds.d * 100
      + thousands.d * 1000
      + 1 AS n
  FROM
    (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
     SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
     SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL
     SELECT 9) AS ones
  CROSS JOIN
    (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
     SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
     SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL
     SELECT 9) AS tens
  CROSS JOIN
    (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
     SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
     SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL
     SELECT 9) AS hundreds
  CROSS JOIN
    (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
     SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
     SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL
     SELECT 9) AS thousands
) AS numbers;

ANALYZE TABLE learning_orders;

SELECT
  COUNT(*) AS row_count,
  MIN(account_id) AS minimum_account_id,
  MAX(account_id) AS maximum_account_id
FROM learning_orders;

-- 基线计划：此时只有主键，没有服务列表接口的联合索引。
EXPLAIN FORMAT = TRADITIONAL
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND created_at >= '2026-01-02 00:00:00'
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- amount 放在末尾用于覆盖返回列，不参与前面的范围定位。
CREATE INDEX idx_learning_orders_account_status_created_id
ON learning_orders (
  account_id,
  status,
  created_at DESC,
  id DESC,
  amount
);

ANALYZE TABLE learning_orders;

-- 创建索引后的目标计划。
EXPLAIN FORMAT = TRADITIONAL
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND created_at >= '2026-01-02 00:00:00'
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 缺少前导 account_id 且 status 选择性较低，观察优化器选择。
EXPLAIN FORMAT = TRADITIONAL
SELECT id, account_id, status
FROM learning_orders
WHERE status = 'paid';

-- 对列调用函数，与原始时间半开区间进行计划对比。
EXPLAIN FORMAT = TRADITIONAL
SELECT id, account_id, created_at
FROM learning_orders
WHERE account_id = 42
  AND DATE(created_at) = '2026-01-05';

EXPLAIN FORMAT = TRADITIONAL
SELECT id, account_id, created_at
FROM learning_orders
WHERE account_id = 42
  AND created_at >= '2026-01-05 00:00:00'
  AND created_at < '2026-01-06 00:00:00';
