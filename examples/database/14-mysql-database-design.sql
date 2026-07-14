-- MySQL 8.4：用户、资料、地址、角色关系模型。
-- 仅在专用学习数据库运行；脚本不删除、截断或覆盖既有业务表。

CREATE TABLE IF NOT EXISTS learning14_users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT uq_learning14_users_email UNIQUE (email),
  CONSTRAINT ck_learning14_users_status
    CHECK (status IN ('active', 'disabled'))
) ENGINE = InnoDB;

-- 共享主键同时表达“一名用户至多一份资料”和资料必须属于用户。
CREATE TABLE IF NOT EXISTS learning14_user_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  bio VARCHAR(500) NULL,
  avatar_url VARCHAR(500) NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_learning14_profiles_user
    FOREIGN KEY (user_id)
    REFERENCES learning14_users (user_id)
    ON DELETE CASCADE
) ENGINE = InnoDB;

-- 一对多：外键放在地址这一侧。
CREATE TABLE IF NOT EXISTS learning14_user_addresses (
  address_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(30) NOT NULL,
  country_code CHAR(2) NOT NULL,
  city VARCHAR(100) NOT NULL,
  address_detail VARCHAR(500) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (address_id),
  KEY ix_learning14_addresses_user (user_id, address_id),
  CONSTRAINT fk_learning14_addresses_user
    FOREIGN KEY (user_id)
    REFERENCES learning14_users (user_id)
    ON DELETE CASCADE,
  CONSTRAINT ck_learning14_addresses_country
    CHECK (CHAR_LENGTH(country_code) = 2)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS learning14_roles (
  role_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_code VARCHAR(50) NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  PRIMARY KEY (role_id),
  CONSTRAINT uq_learning14_roles_code UNIQUE (role_code)
) ENGINE = InnoDB;

-- 多对多关联表；反向索引服务“按角色找用户”。
CREATE TABLE IF NOT EXISTS learning14_user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  granted_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, role_id),
  KEY ix_learning14_user_roles_role (role_id, user_id),
  CONSTRAINT fk_learning14_user_roles_user
    FOREIGN KEY (user_id)
    REFERENCES learning14_users (user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_learning14_user_roles_role
    FOREIGN KEY (role_id)
    REFERENCES learning14_roles (role_id)
    ON DELETE RESTRICT
) ENGINE = InnoDB;

-- 从系统目录验证主键、唯一、外键和 CHECK 约束确实存在。
SELECT
  tc.TABLE_NAME,
  tc.CONSTRAINT_NAME,
  tc.CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS AS tc
WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
  AND tc.TABLE_NAME LIKE 'learning14\_%'
ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME;

-- 验证外键列及删除动作；不关闭 foreign_key_checks。
SELECT
  kcu.TABLE_NAME,
  kcu.COLUMN_NAME,
  kcu.REFERENCED_TABLE_NAME,
  kcu.REFERENCED_COLUMN_NAME,
  rc.DELETE_RULE,
  rc.UPDATE_RULE
FROM information_schema.KEY_COLUMN_USAGE AS kcu
JOIN information_schema.REFERENTIAL_CONSTRAINTS AS rc
  ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
 AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
  AND kcu.TABLE_NAME LIKE 'learning14\_%'
  AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION;
