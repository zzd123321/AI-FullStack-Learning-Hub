-- 第一课：关系模型与第一个 SQL 查询
-- 兼容目标：MySQL 8.4、PostgreSQL 18。
-- 安全说明：只创建当前会话可见的临时表，不修改永久业务表。

CREATE TEMPORARY TABLE learning_users (
  id INTEGER PRIMARY KEY,
  display_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL
);

INSERT INTO learning_users (id, display_name, email, status, created_at)
VALUES
  (101, '林夏', 'linxia@example.com', 'active', '2026-07-01 09:00:00'),
  (102, '陈川', 'chenchuan@example.com', 'disabled', '2026-07-02 10:30:00'),
  (103, '周宁', 'zhouning@example.com', 'active', '2026-07-03 14:20:00');

SELECT id, display_name, status
FROM learning_users
WHERE status = 'active'
ORDER BY id
LIMIT 2 OFFSET 0;
