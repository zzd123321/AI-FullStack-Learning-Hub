-- 第五课：多表关系与 JOIN。
-- 兼容目标：MySQL 8.4、PostgreSQL 18。
-- 安全说明：只创建并写入当前会话可见的临时表。
-- MySQL 临时表不能参与外键约束，因此本示例不声明外键。

CREATE TEMPORARY TABLE learning_accounts (
  id BIGINT PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL
);

CREATE TEMPORARY TABLE learning_orders (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  placed_at TIMESTAMP NOT NULL
);

CREATE TEMPORARY TABLE learning_products (
  id BIGINT PRIMARY KEY,
  product_name VARCHAR(100) NOT NULL,
  current_price DECIMAL(12, 2) NOT NULL
);

CREATE TEMPORARY TABLE learning_order_items (
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  PRIMARY KEY (order_id, product_id),
  CONSTRAINT chk_learning_order_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_learning_order_items_unit_price CHECK (unit_price >= 0)
);

INSERT INTO learning_accounts (id, display_name, status)
VALUES
  (101, '林夏', 'active'),
  (102, '周宁', 'active'),
  (103, '陈川', 'disabled'),
  (104, '吴悠', 'active');

INSERT INTO learning_orders (id, account_id, status, placed_at)
VALUES
  (5001, 101, 'paid', '2026-07-10 09:00:00'),
  (5002, 101, 'cancelled', '2026-07-11 10:00:00'),
  (5003, 102, 'shipped', '2026-07-12 11:00:00'),
  (5004, 103, 'paid', '2026-07-13 12:00:00');

INSERT INTO learning_products (id, product_name, current_price)
VALUES
  (201, '机械键盘', 429.00),
  (202, '无线鼠标', 139.00),
  (203, 'USB-C 数据线', 49.00);

INSERT INTO learning_order_items (order_id, product_id, quantity, unit_price)
VALUES
  (5001, 201, 1, 399.00),
  (5001, 202, 2, 120.00),
  (5002, 203, 1, 39.00),
  (5003, 202, 1, 129.00),
  (5003, 203, 3, 35.00),
  (5004, 201, 1, 399.00);

-- INNER JOIN：4 个订单都能匹配账号。
SELECT
  o.id AS order_id,
  o.status AS order_status,
  a.id AS account_id,
  a.display_name
FROM learning_orders AS o
INNER JOIN learning_accounts AS a
  ON a.id = o.account_id
ORDER BY o.id;

-- LEFT JOIN：保留没有订单的账号 104。
SELECT
  a.id AS account_id,
  a.display_name,
  o.id AS order_id,
  o.status AS order_status
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
ORDER BY a.id, o.id;

-- paid 条件位于 ON：所有账号都保留。
SELECT
  a.id AS account_id,
  a.display_name,
  o.id AS paid_order_id
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
 AND o.status = 'paid'
ORDER BY a.id, o.id;

-- paid 条件位于 WHERE：没有 paid 订单的账号被过滤。
SELECT
  a.id AS account_id,
  a.display_name,
  o.id AS paid_order_id
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
WHERE o.status = 'paid'
ORDER BY a.id, o.id;

-- 右表不可空主键为 NULL，表示账号没有任何订单。
SELECT a.id, a.display_name
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
WHERE o.id IS NULL
ORDER BY a.id;

-- 多表 JOIN：订单 5001 的完整商品明细。
SELECT
  o.id AS order_id,
  p.id AS product_id,
  p.product_name,
  oi.quantity,
  oi.unit_price,
  oi.quantity * oi.unit_price AS line_amount
FROM learning_orders AS o
JOIN learning_order_items AS oi
  ON oi.order_id = o.id
JOIN learning_products AS p
  ON p.id = oi.product_id
WHERE o.id = 5001
ORDER BY p.id;

-- EXISTS：至少有一个 paid 订单的账号，每个账号只返回一次。
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE EXISTS (
  SELECT 1
  FROM learning_orders AS o
  WHERE o.account_id = a.id
    AND o.status = 'paid'
)
ORDER BY a.id;

-- 错误分页示范：LIMIT 2 限制 JOIN 后的两条明细，不是两个订单。
SELECT
  o.id AS order_id,
  oi.product_id,
  oi.quantity
FROM learning_orders AS o
JOIN learning_order_items AS oi
  ON oi.order_id = o.id
ORDER BY o.placed_at DESC, o.id DESC, oi.product_id
LIMIT 2;

-- 正确方向：先选最新两个订单，再连接它们的全部明细。
WITH paged_orders AS (
  SELECT id, account_id, status, placed_at
  FROM learning_orders
  ORDER BY placed_at DESC, id DESC
  LIMIT 2
)
SELECT
  po.id AS order_id,
  po.status,
  p.id AS product_id,
  p.product_name,
  oi.quantity,
  oi.unit_price
FROM paged_orders AS po
JOIN learning_order_items AS oi
  ON oi.order_id = po.id
JOIN learning_products AS p
  ON p.id = oi.product_id
ORDER BY po.placed_at DESC, po.id DESC, p.id;
