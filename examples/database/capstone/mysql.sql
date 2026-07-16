-- 全栈数据库阶段项目：MySQL 8.4
-- 仅在自己的学习数据库运行。
-- 本文件不删除对象或数据；表使用 capstone_ 前缀。

CREATE TABLE IF NOT EXISTS capstone_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT uq_capstone_users_email UNIQUE (email),
  CONSTRAINT chk_capstone_users_status
    CHECK (status IN ('active', 'disabled', 'pending')),
  INDEX idx_capstone_users_status_created_id (status, created_at, id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS capstone_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_capstone_roles_code UNIQUE (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS capstone_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  description VARCHAR(200) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_capstone_permissions_code UNIQUE (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS capstone_user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, role_id),
  INDEX idx_capstone_user_roles_role_user (role_id, user_id),
  CONSTRAINT fk_capstone_user_roles_user
    FOREIGN KEY (user_id) REFERENCES capstone_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_capstone_user_roles_role
    FOREIGN KEY (role_id) REFERENCES capstone_roles (id) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS capstone_role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  INDEX idx_capstone_role_permissions_permission_role (permission_id, role_id),
  CONSTRAINT fk_capstone_role_permissions_role
    FOREIGN KEY (role_id) REFERENCES capstone_roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_capstone_role_permissions_permission
    FOREIGN KEY (permission_id) REFERENCES capstone_permissions (id) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 幂等基础种子：冲突时保留现有业务代码，只同步展示文本。
INSERT INTO capstone_roles (code, name)
VALUES ('admin', '管理员'), ('member', '普通成员') AS incoming
ON DUPLICATE KEY UPDATE name = incoming.name;

INSERT INTO capstone_permissions (code, description)
VALUES
  ('user:read', '读取用户'),
  ('user:write', '创建或修改用户') AS incoming
ON DUPLICATE KEY UPDATE description = incoming.description;

INSERT INTO capstone_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM capstone_roles AS r
JOIN capstone_permissions AS p
  ON (r.code = 'admin' AND p.code IN ('user:read', 'user:write'))
  OR (r.code = 'member' AND p.code = 'user:read')
ON DUPLICATE KEY UPDATE role_id = capstone_role_permissions.role_id;

-- 事务示例：创建用户并分配 member 角色。
-- ROLLBACK 确保演示用户不会保留。
START TRANSACTION;

INSERT INTO capstone_users (email, display_name, status)
VALUES ('transaction-demo@example.test', '事务演示用户', 'active');

SET @capstone_user_id = LAST_INSERT_ID();

INSERT INTO capstone_user_roles (user_id, role_id)
SELECT @capstone_user_id, r.id
FROM capstone_roles AS r
WHERE r.code = 'member';

SELECT u.id, u.email, r.code AS role_code
FROM capstone_users AS u
JOIN capstone_user_roles AS ur ON ur.user_id = u.id
JOIN capstone_roles AS r ON r.id = ur.role_id
WHERE u.id = @capstone_user_id;

ROLLBACK;

-- 稳定分页的用户列表。真实接口把常量改成驱动参数，并限制 pageSize。
SELECT u.id, u.email, u.display_name, u.status, u.created_at
FROM capstone_users AS u
WHERE u.status = 'active'
  AND EXISTS (
    SELECT 1
    FROM capstone_user_roles AS ur
    JOIN capstone_roles AS r ON r.id = ur.role_id
    WHERE ur.user_id = u.id
      AND r.code = 'member'
  )
ORDER BY u.created_at DESC, u.id DESC
LIMIT 20;

-- 用户的有效权限；DISTINCT 消除多个角色带来的重复权限。
SELECT DISTINCT p.code
FROM capstone_user_roles AS ur
JOIN capstone_role_permissions AS rp ON rp.role_id = ur.role_id
JOIN capstone_permissions AS p ON p.id = rp.permission_id
WHERE ur.user_id = 1
ORDER BY p.code;

EXPLAIN
SELECT u.id, u.email, u.display_name, u.status, u.created_at
FROM capstone_users AS u
WHERE u.status = 'active'
ORDER BY u.created_at DESC, u.id DESC
LIMIT 20;

