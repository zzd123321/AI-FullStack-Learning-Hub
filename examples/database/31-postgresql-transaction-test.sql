-- PostgreSQL 18：临时表和所有 fixture 都位于当前测试事务。
-- 请仍在专用学习/测试连接运行。

SELECT version(), current_database(), current_user,
       current_setting('transaction_isolation'), current_setting('TimeZone');

BEGIN;

CREATE TEMPORARY TABLE ci_test_accounts_31 (
  account_id bigint PRIMARY KEY,
  balance_cents bigint NOT NULL CHECK (balance_cents >= 0)
) ON COMMIT DROP;

INSERT INTO ci_test_accounts_31 (account_id, balance_cents)
VALUES (1, 10000), (2, 5000);

SAVEPOINT before_transfer;

UPDATE ci_test_accounts_31
SET balance_cents = balance_cents - 1200
WHERE account_id = 1 AND balance_cents >= 1200;

UPDATE ci_test_accounts_31
SET balance_cents = balance_cents + 1200
WHERE account_id = 2;

-- 预期：total_cents = 15000，negative_accounts = 0。
SELECT SUM(balance_cents) AS total_cents,
       COUNT(*) FILTER (WHERE balance_cents < 0) AS negative_accounts
FROM ci_test_accounts_31;

ROLLBACK TO SAVEPOINT before_transfer;

-- 预期：账户 1/2 分别恢复为 10000/5000。
SELECT account_id, balance_cents
FROM ci_test_accounts_31
ORDER BY account_id;

-- 回滚 fixture 与临时表创建，不触碰任何永久业务对象。
ROLLBACK;
