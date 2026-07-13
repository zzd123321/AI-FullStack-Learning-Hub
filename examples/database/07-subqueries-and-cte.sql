-- 第七课：子查询、派生表与 CTE。
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
  amount DECIMAL(12, 2) NOT NULL,
  placed_at TIMESTAMP NOT NULL
);

CREATE TEMPORARY TABLE learning_suspensions (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NULL,
  reason VARCHAR(100) NOT NULL
);

CREATE TEMPORARY TABLE learning_org_units (
  id BIGINT PRIMARY KEY,
  parent_id BIGINT NULL,
  name VARCHAR(80) NOT NULL
);

INSERT INTO learning_accounts (id, display_name)
VALUES
  (101, '林夏'),
  (102, '周宁'),
  (103, '陈川'),
  (104, '吴悠');

INSERT INTO learning_orders (id, account_id, status, amount, placed_at)
VALUES
  (5001, 101, 'paid', 120.00, '2026-07-10 09:00:00'),
  (5002, 101, 'cancelled', 50.00, '2026-07-11 10:00:00'),
  (5003, 102, 'shipped', 200.00, '2026-07-12 11:00:00'),
  (5004, 103, 'paid', 80.00, '2026-07-13 12:00:00'),
  (5005, 103, 'paid', 220.00, '2026-07-13 13:00:00');

-- 故意保留一条 account_id 为 NULL 的记录，用于演示 NOT IN 陷阱。
INSERT INTO learning_suspensions (id, account_id, reason)
VALUES
  (1, 102, 'manual review'),
  (2, NULL, 'legacy data awaiting cleanup');

INSERT INTO learning_org_units (id, parent_id, name)
VALUES
  (1, NULL, '总部'),
  (2, 1, '研发中心'),
  (3, 1, '产品中心'),
  (4, 2, '平台组'),
  (5, 2, '应用组'),
  (6, 3, '增长组');

-- 标量子查询：计算有效订单的整体平均金额。
SELECT AVG(amount) AS overall_average_amount
FROM learning_orders
WHERE status IN ('paid', 'shipped');

-- 使用标量子查询筛选高于整体平均金额的有效订单。
SELECT id, account_id, amount
FROM learning_orders
WHERE status IN ('paid', 'shipped')
  AND amount > (
    SELECT AVG(amount)
    FROM learning_orders
    WHERE status IN ('paid', 'shipped')
  )
ORDER BY id;

-- EXISTS：每个账号最多返回一次，不因匹配多笔订单而重复。
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE EXISTS (
  SELECT 1
  FROM learning_orders AS o
  WHERE o.account_id = a.id
    AND o.status IN ('paid', 'shipped')
    AND o.amount >= 200.00
)
ORDER BY a.id;

-- 仅用于观察陷阱：右侧存在 NULL，因此 NOT IN 返回 0 行。
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE a.id NOT IN (
  SELECT s.account_id
  FROM learning_suspensions AS s
)
ORDER BY a.id;

-- NOT EXISTS 不会被暂停表中无关的 NULL 污染。
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE NOT EXISTS (
  SELECT 1
  FROM learning_suspensions AS s
  WHERE s.account_id = a.id
)
ORDER BY a.id;

-- 找出完全没有有效订单的账号。
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE NOT EXISTS (
  SELECT 1
  FROM learning_orders AS o
  WHERE o.account_id = a.id
    AND o.status IN ('paid', 'shipped')
)
ORDER BY a.id;

-- 相关标量子查询：与当前账号自身的有效订单平均金额比较。
SELECT o.id, o.account_id, o.amount
FROM learning_orders AS o
WHERE o.status IN ('paid', 'shipped')
  AND o.amount > (
    SELECT AVG(peer.amount)
    FROM learning_orders AS peer
    WHERE peer.account_id = o.account_id
      AND peer.status IN ('paid', 'shipped')
  )
ORDER BY o.id;

-- 派生表：先聚合到每个账号一行，再关联账号资料。
SELECT
  a.id,
  a.display_name,
  totals.order_count,
  totals.order_amount
FROM learning_accounts AS a
JOIN (
  SELECT
    account_id,
    COUNT(*) AS order_count,
    SUM(amount) AS order_amount
  FROM learning_orders
  WHERE status IN ('paid', 'shipped')
  GROUP BY account_id
) AS totals
  ON totals.account_id = a.id
ORDER BY a.id;

-- 多个 CTE 组成流水线，并用 LEFT JOIN 保留零订单账号。
WITH
billable_orders AS (
  SELECT id, account_id, amount
  FROM learning_orders
  WHERE status IN ('paid', 'shipped')
),
account_totals AS (
  SELECT
    account_id,
    COUNT(*) AS order_count,
    SUM(amount) AS order_amount
  FROM billable_orders
  GROUP BY account_id
)
SELECT
  a.id,
  a.display_name,
  COALESCE(t.order_count, 0) AS order_count,
  COALESCE(t.order_amount, 0.00) AS order_amount
FROM learning_accounts AS a
LEFT JOIN account_totals AS t
  ON t.account_id = a.id
ORDER BY a.id;

-- 递归 CTE：从根组织向下展开，并计算深度。
WITH RECURSIVE org_tree AS (
  SELECT
    id,
    parent_id,
    name,
    0 AS depth
  FROM learning_org_units
  WHERE parent_id IS NULL

  UNION ALL

  SELECT
    child.id,
    child.parent_id,
    child.name,
    parent.depth + 1 AS depth
  FROM learning_org_units AS child
  JOIN org_tree AS parent
    ON child.parent_id = parent.id
)
SELECT id, parent_id, name, depth
FROM org_tree
ORDER BY depth, id;
