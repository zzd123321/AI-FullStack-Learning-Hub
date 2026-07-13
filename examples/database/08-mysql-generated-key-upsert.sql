-- 第八课 MySQL 8.4 专属：AUTO_INCREMENT、LAST_INSERT_ID 与 UPSERT。
-- 安全说明：只修改会话临时表，事务末尾回滚。

CREATE TEMPORARY TABLE learning_mysql_contacts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL
) ENGINE = InnoDB;

START TRANSACTION;

INSERT INTO learning_mysql_contacts (email, display_name)
VALUES ('lin@example.com', '林夏');

SELECT LAST_INSERT_ID() AS generated_contact_id;

-- 使用新行别名，避免已弃用的 VALUES(column) 取值方式。
INSERT INTO learning_mysql_contacts (email, display_name)
VALUES ('lin@example.com', '林夏（更新）') AS new
ON DUPLICATE KEY UPDATE
  display_name = new.display_name;

SELECT ROW_COUNT() AS upsert_affected_rows;

SELECT id, email, display_name
FROM learning_mysql_contacts
ORDER BY id;

ROLLBACK;

SELECT COUNT(*) AS contact_count_after_rollback
FROM learning_mysql_contacts;
