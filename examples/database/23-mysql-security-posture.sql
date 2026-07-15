-- 第 23 课 MySQL 8.4：身份、TLS、角色与权限只读检查。
-- 不创建账号、角色，不执行 GRANT/REVOKE，也不修改审计配置。

SELECT
  VERSION() AS mysql_version,
  USER() AS client_account,
  CURRENT_USER() AS authenticated_account,
  CURRENT_ROLE() AS active_roles,
  DATABASE() AS current_database,
  @@require_secure_transport AS require_secure_transport;

-- 当前 session TLS 状态。Ssl_cipher 为空通常表示当前连接未使用 TLS。
SELECT
  VARIABLE_NAME,
  VARIABLE_VALUE
FROM performance_schema.session_status
WHERE VARIABLE_NAME IN (
  'Ssl_cipher',
  'Ssl_version',
  'Ssl_verify_mode',
  'Ssl_session_reused'
)
ORDER BY VARIABLE_NAME;

-- 当前可见的全局权限；重点审查 GRANTABLE 和管理类权限。
SELECT
  GRANTEE,
  PRIVILEGE_TYPE,
  IS_GRANTABLE
FROM information_schema.USER_PRIVILEGES
ORDER BY GRANTEE, PRIVILEGE_TYPE;

-- schema/table 级权限。可见范围取决于执行诊断账号本身的权限。
SELECT
  GRANTEE,
  TABLE_SCHEMA,
  PRIVILEGE_TYPE,
  IS_GRANTABLE
FROM information_schema.SCHEMA_PRIVILEGES
WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY GRANTEE, TABLE_SCHEMA, PRIVILEGE_TYPE;

SELECT
  GRANTEE,
  TABLE_SCHEMA,
  TABLE_NAME,
  PRIVILEGE_TYPE,
  IS_GRANTABLE
FROM information_schema.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY GRANTEE, TABLE_SCHEMA, TABLE_NAME, PRIVILEGE_TYPE;

-- 当前 session 已启用的角色，不等同于账号可被授予的全部角色。
SELECT ROLE_NAME, ROLE_HOST, IS_DEFAULT, IS_MANDATORY
FROM information_schema.ENABLED_ROLES
ORDER BY ROLE_NAME, ROLE_HOST;

-- MySQL Enterprise Audit 仅在相应商业版能力已安装时出现；无行不代表有其他审计覆盖。
SELECT
  PLUGIN_NAME,
  PLUGIN_STATUS,
  PLUGIN_VERSION,
  PLUGIN_TYPE
FROM information_schema.PLUGINS
WHERE PLUGIN_NAME = 'audit_log';
