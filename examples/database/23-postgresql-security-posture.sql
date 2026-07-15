-- 第 23 课 PostgreSQL 18：身份、TLS、角色、RLS 与 HBA 只读检查。
-- 不创建/修改角色、policy、权限或认证配置。

SELECT
  version() AS postgresql_version,
  current_database() AS database_name,
  session_user,
  current_user,
  current_role,
  inet_client_addr() AS client_address,
  current_setting('ssl') AS server_ssl_enabled,
  current_setting('row_security') AS row_security_setting;

-- 当前连接 TLS 与客户端证书信息；非 TLS 连接对应 ssl=false。
SELECT
  ssl,
  version,
  cipher,
  bits,
  client_dn,
  issuer_dn
FROM pg_stat_ssl
WHERE pid = pg_backend_pid();

-- 审查高权限、可登录和 RLS bypass 角色。pg_roles 不暴露密码内容。
SELECT
  rolname,
  rolsuper,
  rolinherit,
  rolcreaterole,
  rolcreatedb,
  rolcanlogin,
  rolreplication,
  rolconnlimit,
  rolvaliduntil,
  rolbypassrls
FROM pg_roles
ORDER BY rolsuper DESC, rolbypassrls DESC, rolcanlogin DESC, rolname;

-- 当前数据库中启用/强制 RLS 的普通表与分区表。
SELECT
  namespace.nspname AS schema_name,
  relation.relname AS table_name,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced,
  owner.rolname AS owner_role
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
JOIN pg_roles AS owner ON owner.oid = relation.relowner
WHERE relation.relkind IN ('r', 'p')
  AND (relation.relrowsecurity OR relation.relforcerowsecurity)
ORDER BY schema_name, table_name;

-- Policy 定义。qual/with_check 可能包含业务字段名，应限制诊断结果访问。
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
ORDER BY schemaname, tablename, policyname;

-- 当前用户可见的显式/继承表权限。
SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY grantee, table_schema, table_name, privilege_type;

-- HBA 规则按顺序首条匹配；非管理员可能看不到完整内容。
-- error 非空表示配置行无法正确解析，应在发布前处理。
SELECT
  rule_number,
  type,
  database,
  user_name,
  address,
  auth_method,
  options,
  error
FROM pg_hba_file_rules
ORDER BY rule_number;
