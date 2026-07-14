-- 第九课 PostgreSQL 18：B-Tree、联合索引与查询形状。
-- 安全说明：只创建当前会话临时表及临时表上的索引。

CREATE TEMPORARY TABLE learning_orders (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMP NOT NULL
);

INSERT INTO learning_orders (
  id,
  account_id,
  status,
  amount,
  created_at
)
SELECT
  n,
  MOD(n, 97) + 1 AS account_id,
  CASE MOD(n, 4)
    WHEN 0 THEN 'pending'
    WHEN 1 THEN 'paid'
    WHEN 2 THEN 'shipped'
    ELSE 'cancelled'
  END AS status,
  (MOD(n, 50000) + 100) / 100.0 AS amount,
  TIMESTAMP '2026-01-01 00:00:00'
    + n * INTERVAL '1 minute' AS created_at
FROM generate_series(1, 10000) AS sequence(n);

ANALYZE learning_orders;

SELECT
  COUNT(*) AS row_count,
  MIN(account_id) AS minimum_account_id,
  MAX(account_id) AS maximum_account_id
FROM learning_orders;

-- 基线计划：此时只有主键，没有服务列表接口的联合索引。
EXPLAIN
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND created_at >= TIMESTAMP '2026-01-02 00:00:00'
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- INCLUDE 让 amount 可供 index-only scan 使用，但不参与键排序。
CREATE INDEX idx_learning_orders_account_status_created_id
ON learning_orders (
  account_id,
  status,
  created_at DESC,
  id DESC
)
INCLUDE (amount);

ANALYZE learning_orders;

-- 创建索引后的目标计划。
EXPLAIN
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND created_at >= TIMESTAMP '2026-01-02 00:00:00'
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 缺少前导 account_id 且 status 选择性较低，观察顺序或 skip scan 选择。
EXPLAIN
SELECT id, account_id, status
FROM learning_orders
WHERE status = 'paid';

-- 对列进行类型转换，与原始时间半开区间进行计划对比。
EXPLAIN
SELECT id, account_id, created_at
FROM learning_orders
WHERE account_id = 42
  AND CAST(created_at AS DATE) = DATE '2026-01-05';

EXPLAIN
SELECT id, account_id, created_at
FROM learning_orders
WHERE account_id = 42
  AND created_at >= TIMESTAMP '2026-01-05 00:00:00'
  AND created_at < TIMESTAMP '2026-01-06 00:00:00';
