-- 第四课：SELECT 筛选、排序与分页。
-- 兼容目标：MySQL 8.4、PostgreSQL 18。
-- 安全说明：只创建并写入当前会话可见的临时表。

CREATE TEMPORARY TABLE learning_orders (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  reference_code VARCHAR(40) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  customer_note VARCHAR(200) NULL,
  placed_at TIMESTAMP NOT NULL,
  shipped_at TIMESTAMP NULL,
  CONSTRAINT chk_learning_orders_status
    CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  CONSTRAINT chk_learning_orders_total_amount
    CHECK (total_amount >= 0)
);

INSERT INTO learning_orders (
  id,
  account_id,
  reference_code,
  status,
  total_amount,
  customer_note,
  placed_at,
  shipped_at
)
VALUES
  (1001, 101, 'WEB_202607_001', 'paid', 199.00, '请工作日送达',
   '2026-07-12 09:30:00', NULL),
  (1002, 101, 'WEB_202607_002', 'shipped', 88.50, NULL,
   '2026-07-12 09:30:00', '2026-07-13 08:00:00'),
  (1003, 102, 'APP_202607_003', 'paid', 520.00, 'urgent: call first',
   '2026-07-11 15:00:00', NULL),
  (1004, 101, 'WEB_202607_004', 'paid', 120.00, 'gift wrap',
   '2026-07-10 10:00:00', NULL),
  (1005, 101, 'STORE_202607_005', 'cancelled', 50.00, NULL,
   '2026-07-09 12:00:00', NULL),
  (1006, 103, 'WEBX202607X006', 'shipped', 300.00, 'urgent delivery',
   '2026-07-08 18:20:00', '2026-07-09 09:00:00'),
  (1007, 101, 'WEB_202606_007', 'shipped', 760.00, NULL,
   '2026-06-30 23:59:59', '2026-07-02 10:00:00'),
  (1008, 101, 'WEB_202608_008', 'pending', 35.00, NULL,
   '2026-08-01 00:00:00', NULL);

-- 账号 101 在 2026 年 7 月已支付或已发货的订单。
SELECT
  id,
  reference_code,
  status,
  total_amount,
  placed_at
FROM learning_orders
WHERE account_id = 101
  AND status IN ('paid', 'shipped')
  AND placed_at >= '2026-07-01 00:00:00'
  AND placed_at < '2026-08-01 00:00:00'
ORDER BY placed_at DESC, id DESC;

-- 尚未发货的已支付订单；不能使用 shipped_at = NULL。
SELECT id, reference_code, status
FROM learning_orders
WHERE status = 'paid'
  AND shipped_at IS NULL
ORDER BY id;

-- 字面量 WEB_ 前缀：!_ 转义下划线，末尾 % 保留通配含义。
SELECT id, reference_code
FROM learning_orders
WHERE reference_code LIKE 'WEB!_%' ESCAPE '!'
ORDER BY id;

-- 包含 urgent 的备注。大小写行为取决于数据库与排序规则。
SELECT id, customer_note
FROM learning_orders
WHERE customer_note LIKE '%urgent%'
ORDER BY id;

-- 与列表筛选完全一致的总数查询。
SELECT COUNT(*) AS total
FROM learning_orders
WHERE account_id = 101
  AND status IN ('paid', 'shipped')
  AND placed_at >= '2026-07-01 00:00:00'
  AND placed_at < '2026-08-01 00:00:00';

-- 页码分页：第一页与第二页，每页三条。
SELECT id, reference_code, placed_at
FROM learning_orders
ORDER BY placed_at DESC, id DESC
LIMIT 3 OFFSET 0;

SELECT id, reference_code, placed_at
FROM learning_orders
ORDER BY placed_at DESC, id DESC
LIMIT 3 OFFSET 3;

-- 游标分页：继续读取 (2026-07-10 10:00:00, 1004) 之后的行。
SELECT id, reference_code, placed_at
FROM learning_orders
WHERE placed_at < '2026-07-10 10:00:00'
   OR (placed_at = '2026-07-10 10:00:00' AND id < 1004)
ORDER BY placed_at DESC, id DESC
LIMIT 3;
