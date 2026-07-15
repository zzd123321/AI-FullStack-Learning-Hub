-- 第 16 课 PostgreSQL 18：SQL 与索引优化。
-- 只创建会话临时表；EXPLAIN ANALYZE 只执行 SELECT。

CREATE TEMPORARY TABLE learning_orders (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  note VARCHAR(200) NOT NULL
);

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
  TIMESTAMP '2026-01-01 00:00:00' + n * INTERVAL '1 minute',
  'learning-order-' || n
FROM generate_series(1, 10000) AS sequence(n);

-- INCLUDE 列不参与 B-Tree 搜索顺序，只提供 index-only scan 的机会。
CREATE INDEX idx_learning_orders_list_cover
ON learning_orders (account_id, status, created_at DESC, id DESC)
INCLUDE (amount);

ANALYZE learning_orders;

-- 1. 函数包列：普通 created_at 索引不能直接表示该表达式搜索。
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY ON)
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND created_at::date = DATE '2026-01-05'
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 2. 半开区间：保持日期语义并形成可搜索范围。
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY ON)
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND created_at >= TIMESTAMP '2026-01-05 00:00:00'
  AND created_at <  TIMESTAMP '2026-01-06 00:00:00'
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 3. 深 OFFSET：即使有序访问，也需跳过前面的匹配行。
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY ON)
SELECT id, amount, created_at
FROM learning_orders
WHERE status = 'paid'
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 3000;

-- 4. Keyset：从上一页最后排序键继续。
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY ON)
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND (created_at, id) < (TIMESTAMP '2026-01-07 00:00:00', 8640)
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 5. 查看该临时表索引定义和大小。
SELECT
  indexname,
  indexdef,
  pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
FROM pg_indexes
WHERE schemaname LIKE 'pg_temp%'
  AND tablename = 'learning_orders'
ORDER BY indexname;
