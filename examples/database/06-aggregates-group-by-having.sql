-- 第六课：聚合函数、GROUP BY 与 HAVING。
-- 兼容目标：MySQL 8.4、PostgreSQL 18。
-- 安全说明：只创建并写入当前会话可见的临时表。

CREATE TEMPORARY TABLE learning_accounts (
  id BIGINT PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL
);

CREATE TEMPORARY TABLE learning_orders (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  shipping_fee DECIMAL(12, 2) NOT NULL,
  placed_at TIMESTAMP NOT NULL
);

CREATE TEMPORARY TABLE learning_order_items (
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  discount_amount DECIMAL(12, 2) NULL,
  PRIMARY KEY (order_id, product_id),
  CONSTRAINT chk_learning_aggregate_quantity CHECK (quantity > 0),
  CONSTRAINT chk_learning_aggregate_unit_price CHECK (unit_price >= 0),
  CONSTRAINT chk_learning_aggregate_discount
    CHECK (discount_amount IS NULL OR discount_amount >= 0)
);

INSERT INTO learning_accounts (id, display_name)
VALUES
  (101, '林夏'),
  (102, '周宁'),
  (103, '陈川'),
  (104, '吴悠');

INSERT INTO learning_orders (id, account_id, status, shipping_fee, placed_at)
VALUES
  (5001, 101, 'paid', 10.00, '2026-07-10 09:00:00'),
  (5002, 101, 'cancelled', 0.00, '2026-07-11 10:00:00'),
  (5003, 102, 'shipped', 0.00, '2026-07-12 11:00:00'),
  (5004, 103, 'paid', 15.00, '2026-07-13 12:00:00'),
  (5005, 101, 'paid', 5.00, '2026-07-13 13:00:00');

INSERT INTO learning_order_items (
  order_id,
  product_id,
  quantity,
  unit_price,
  discount_amount
)
VALUES
  (5001, 201, 1, 399.00, NULL),
  (5001, 202, 2, 120.00, 20.00),
  (5002, 203, 1, 39.00, NULL),
  (5003, 202, 1, 129.00, NULL),
  (5003, 203, 3, 35.00, 5.00),
  (5004, 201, 1, 399.00, NULL),
  (5005, 203, 2, 40.00, NULL);

-- 整体聚合：COUNT(*) 统计行，COUNT(column) 忽略 NULL。
SELECT
  COUNT(*) AS line_count,
  COUNT(discount_amount) AS discounted_line_count,
  SUM(quantity) AS unit_count,
  MIN(unit_price) AS minimum_unit_price,
  MAX(unit_price) AS maximum_unit_price,
  AVG(unit_price) AS average_line_unit_price
FROM learning_order_items;

-- 空集：COUNT 为 0，SUM 为 NULL，COALESCE 可按接口契约转为零。
SELECT
  COUNT(*) AS empty_count,
  SUM(shipping_fee) AS nullable_empty_sum,
  COALESCE(SUM(shipping_fee), 0.00) AS zero_empty_sum
FROM learning_orders
WHERE id < 0;

-- 每个订单一行的明细汇总。
SELECT
  order_id,
  COUNT(*) AS line_count,
  SUM(quantity) AS unit_count,
  SUM(
    quantity * unit_price - COALESCE(discount_amount, 0.00)
  ) AS item_amount
FROM learning_order_items
GROUP BY order_id
ORDER BY order_id;

-- WHERE 先筛明细，HAVING 再筛分组。
SELECT
  account_id,
  COUNT(*) AS billable_order_count
FROM learning_orders
WHERE status IN ('paid', 'shipped')
GROUP BY account_id
HAVING COUNT(*) >= 2
ORDER BY account_id;

-- 条件聚合：一次计算多个状态指标。
SELECT
  account_id,
  COUNT(*) AS total_order_count,
  SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_order_count,
  SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END)
    AS shipped_order_count,
  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)
    AS cancelled_order_count
FROM learning_orders
GROUP BY account_id
ORDER BY account_id;

-- LEFT JOIN：账号 104 的 JOIN 行数为 1，真实订单数为 0。
SELECT
  a.id AS account_id,
  a.display_name,
  COUNT(*) AS joined_row_count,
  COUNT(o.id) AS order_count,
  SUM(
    CASE
      WHEN o.status IN ('paid', 'shipped') THEN 1
      ELSE 0
    END
  ) AS billable_order_count
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
GROUP BY a.id, a.display_name
ORDER BY a.id;

-- 错误示范：一对多 JOIN 让订单运费按明细行重复相加。
SELECT SUM(o.shipping_fee) AS wrong_shipping_fee_total
FROM learning_orders AS o
JOIN learning_order_items AS oi
  ON oi.order_id = o.id;

-- 正确总运费：每个订单只出现一次。
SELECT SUM(shipping_fee) AS correct_shipping_fee_total
FROM learning_orders;

-- 先把明细预聚合到每个订单一行，再按账号汇总非取消订单。
WITH order_amounts AS (
  SELECT
    order_id,
    SUM(
      quantity * unit_price - COALESCE(discount_amount, 0.00)
    ) AS item_amount
  FROM learning_order_items
  GROUP BY order_id
)
SELECT
  o.account_id,
  COUNT(*) AS order_count,
  SUM(oa.item_amount + o.shipping_fee) AS order_amount
FROM learning_orders AS o
JOIN order_amounts AS oa
  ON oa.order_id = o.id
WHERE o.status <> 'cancelled'
GROUP BY o.account_id
ORDER BY o.account_id;

-- 按售出件数加权的平均单价，而不是按明细行简单平均。
SELECT
  SUM(quantity * unit_price) / NULLIF(SUM(quantity) * 1.0, 0.0)
    AS weighted_average_unit_price
FROM learning_order_items;

-- 按日期与状态组合分组。真实报表还必须先确定统计时区。
SELECT
  CAST(placed_at AS DATE) AS order_date,
  status,
  COUNT(*) AS order_count,
  SUM(shipping_fee) AS shipping_fee_total
FROM learning_orders
GROUP BY CAST(placed_at AS DATE), status
ORDER BY order_date, status;
