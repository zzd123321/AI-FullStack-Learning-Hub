-- 第八课：跨 MySQL 8.4 与 PostgreSQL 18 的安全写入主线。
-- 安全说明：只修改会话临时表，所有演示 DML 最终都会回滚。
-- MySQL 运行前提：临时表使用默认的 InnoDB 等事务型存储引擎。

CREATE TEMPORARY TABLE learning_accounts (
  id BIGINT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  deleted_at TIMESTAMP NULL
);

CREATE TEMPORARY TABLE learning_audit_events (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  action VARCHAR(50) NOT NULL,
  occurred_at TIMESTAMP NOT NULL
);

INSERT INTO learning_accounts (
  id,
  email,
  display_name,
  status,
  version,
  deleted_at
)
VALUES
  (101, 'lin@example.com', '林夏', 'active', 1, NULL),
  (102, 'zhou@example.com', '周宁', 'active', 3, NULL),
  (103, 'chen@example.com', '陈川', 'suspended', 2, NULL);

-- 事务外的基线数据：后面的 ROLLBACK 应恢复到这里。
SELECT id, email, display_name, status, version, deleted_at
FROM learning_accounts
ORDER BY id;

BEGIN;

-- INSERT 显式列名。账号 104 只存在于本事务中。
INSERT INTO learning_accounts (
  id,
  email,
  display_name,
  status,
  version
)
VALUES (104, 'wu@example.com', '吴悠', 'active', 1);

INSERT INTO learning_audit_events (
  id,
  account_id,
  action,
  occurred_at
)
VALUES (9001, 104, 'account.created', '2026-07-13 14:00:00');

SELECT id, email, status, version
FROM learning_accounts
WHERE id = 104;

-- 乐观并发控制：期望版本正确时更新一行并递增版本。
UPDATE learning_accounts
SET
  display_name = '林夏（已验证）',
  version = version + 1
WHERE id = 101
  AND version = 1;

SELECT id, display_name, version
FROM learning_accounts
WHERE id = 101;

-- 模拟过期客户端：仍携带 version=1，因此不会覆盖刚才的结果。
UPDATE learning_accounts
SET
  display_name = '过期客户端的名称',
  version = version + 1
WHERE id = 101
  AND version = 1;

SELECT id, display_name, version
FROM learning_accounts
WHERE id = 101;

-- 状态转换把旧状态写进 WHERE；重复执行时第二次应影响 0 行。
UPDATE learning_accounts
SET status = 'suspended'
WHERE id = 102
  AND status = 'active';

UPDATE learning_accounts
SET status = 'suspended'
WHERE id = 102
  AND status = 'active';

SELECT id, status, version
FROM learning_accounts
WHERE id = 102;

-- 软删除仍是 UPDATE；普通查询需要统一过滤 deleted_at。
UPDATE learning_accounts
SET deleted_at = '2026-07-13 15:00:00'
WHERE id = 103
  AND deleted_at IS NULL;

SELECT id, email, deleted_at
FROM learning_accounts
WHERE deleted_at IS NULL
ORDER BY id;

-- 硬删除仅针对本事务刚插入、且邮箱也精确匹配的临时表行。
DELETE FROM learning_accounts
WHERE id = 104
  AND email = 'wu@example.com';

SELECT COUNT(*) AS account_count_before_rollback
FROM learning_accounts;

SELECT COUNT(*) AS audit_count_before_rollback
FROM learning_audit_events;

-- 撤销事务中的 INSERT、UPDATE 与 DELETE。
ROLLBACK;

-- 验证恢复到初始三行；审计表也恢复为空。
SELECT id, email, display_name, status, version, deleted_at
FROM learning_accounts
ORDER BY id;

SELECT COUNT(*) AS audit_count_after_rollback
FROM learning_audit_events;
