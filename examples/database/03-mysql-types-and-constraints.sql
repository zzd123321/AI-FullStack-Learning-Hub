-- 第三课：MySQL 数据类型、默认值与约束。
-- 兼容目标：MySQL 8.4。
-- 安全说明：只创建当前会话可见的临时表，不修改永久业务表。

CREATE TEMPORARY TABLE learning_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  credit_limit DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  login_count INTEGER UNSIGNED NOT NULL DEFAULT 0,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_learning_accounts_email UNIQUE (email),
  CONSTRAINT chk_learning_accounts_status
    CHECK (status IN ('pending', 'active', 'disabled')),
  CONSTRAINT chk_learning_accounts_credit_limit CHECK (credit_limit >= 0),
  CONSTRAINT chk_learning_accounts_login_count CHECK (login_count >= 0),
  CONSTRAINT chk_learning_accounts_marketing_opt_in
    CHECK (marketing_opt_in IN (FALSE, TRUE))
);

INSERT INTO learning_accounts (
  email,
  display_name,
  credit_limit
)
VALUES (
  'linxia@example.com',
  '林夏',
  1000.00
);

INSERT INTO learning_accounts (
  email,
  display_name,
  status,
  credit_limit,
  login_count,
  marketing_opt_in,
  last_login_at
)
VALUES (
  'zhouning@example.com',
  '周宁',
  'active',
  2500.50,
  3,
  TRUE,
  CURRENT_TIMESTAMP
);

SELECT
  id,
  email,
  display_name,
  status,
  credit_limit,
  login_count,
  marketing_opt_in,
  created_at,
  last_login_at
FROM learning_accounts
ORDER BY id;

SELECT id, email
FROM learning_accounts
WHERE last_login_at IS NULL
ORDER BY id;
