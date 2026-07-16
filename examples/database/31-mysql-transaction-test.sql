-- MySQL 8.4：只使用当前 session 可见的 InnoDB TEMPORARY 表。
-- 请仍在专用学习/测试连接运行；断开 session 后临时表自动清理。

SELECT VERSION(), DATABASE(), @@hostname, @@transaction_isolation, @@sql_mode;

-- TEMPORARY 表创建不触发隐式 COMMIT，但创建本身不能由 ROLLBACK 撤销。
CREATE TEMPORARY TABLE ci_test_accounts_31 (
  account_id BIGINT PRIMARY KEY,
  balance_cents BIGINT NOT NULL,
  CONSTRAINT ci_test_balance_nonnegative_31 CHECK (balance_cents >= 0)
) ENGINE = InnoDB;

START TRANSACTION;

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
       SUM(balance_cents < 0) AS negative_accounts
FROM ci_test_accounts_31;

ROLLBACK TO SAVEPOINT before_transfer;

-- 预期：账户 1/2 分别恢复为 10000/5000。
SELECT account_id, balance_cents
FROM ci_test_accounts_31
ORDER BY account_id;

ROLLBACK;

-- fixture DML 已回滚，临时表仍存在至 session 结束；预期 row_count = 0。
SELECT COUNT(*) AS row_count FROM ci_test_accounts_31;
