-- 第十一课 PostgreSQL 18：事务、ACID 与保存点。
-- 安全说明：只修改会话临时表，演示事务最终整体回滚。

CREATE TEMPORARY TABLE learning_accounts (
  id BIGINT PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  balance NUMERIC(12, 2) NOT NULL CHECK (balance >= 0)
);

CREATE TEMPORARY TABLE learning_transfers (
  id BIGINT PRIMARY KEY,
  request_key VARCHAR(100) NOT NULL UNIQUE,
  from_account_id BIGINT NOT NULL,
  to_account_id BIGINT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMP NOT NULL
);

CREATE TEMPORARY TABLE learning_audit_events (
  id BIGINT PRIMARY KEY,
  message VARCHAR(200) NOT NULL
);

INSERT INTO learning_accounts (id, display_name, balance)
VALUES (101, '林夏', 1000.00), (102, '周宁', 500.00);

SELECT id, balance FROM learning_accounts ORDER BY id;
SELECT SUM(balance) AS total_balance_before FROM learning_accounts;

BEGIN;

UPDATE learning_accounts
SET balance = balance - 250.00
WHERE id = 101 AND balance >= 250.00
RETURNING id, balance;

UPDATE learning_accounts
SET balance = balance + 250.00
WHERE id = 102
RETURNING id, balance;

INSERT INTO learning_transfers (
  id, request_key, from_account_id, to_account_id, amount, created_at
)
VALUES (
  7001, 'transfer-20260714-001', 101, 102, 250.00,
  TIMESTAMP '2026-07-14 10:00:00'
)
RETURNING id, request_key, amount;

SELECT id, balance FROM learning_accounts ORDER BY id;
SELECT SUM(balance) AS total_balance_in_transaction FROM learning_accounts;
SELECT COUNT(*) AS transfer_count_in_transaction FROM learning_transfers;

SAVEPOINT before_optional_audit;
INSERT INTO learning_audit_events (id, message)
VALUES (9001, '这条可选审计记录将回滚到保存点');
SELECT COUNT(*) AS audit_count_before_savepoint_rollback
FROM learning_audit_events;

ROLLBACK TO SAVEPOINT before_optional_audit;
SELECT COUNT(*) AS audit_count_after_savepoint_rollback
FROM learning_audit_events;
RELEASE SAVEPOINT before_optional_audit;

ROLLBACK;

SELECT id, balance FROM learning_accounts ORDER BY id;
SELECT SUM(balance) AS total_balance_after_rollback FROM learning_accounts;
SELECT COUNT(*) AS transfer_count_after_rollback FROM learning_transfers;
SELECT COUNT(*) AS audit_count_after_rollback FROM learning_audit_events;
