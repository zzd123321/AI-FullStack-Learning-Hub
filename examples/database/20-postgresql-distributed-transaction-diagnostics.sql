-- 第 20 课 PostgreSQL 18：2PC 与 FDW 只读诊断。
-- 不执行 PREPARE、COMMIT PREPARED 或 ROLLBACK PREPARED。

SELECT
  version() AS postgresql_version,
  current_database() AS database_name,
  current_setting('max_prepared_transactions') AS max_prepared_transactions,
  current_setting('max_connections') AS max_connections;

-- 遗留 prepared 事务会继续持锁并影响 VACUUM；恢复决定必须来自外部协调器。
SELECT
  transaction,
  gid,
  prepared,
  clock_timestamp() - prepared AS prepared_age,
  owner,
  database
FROM pg_prepared_xacts
ORDER BY prepared;

-- 当前数据库的容量与事务活动，用于跨 shard 集中比较倾斜。
SELECT
  database_name,
  pg_database_size(database_name) AS database_bytes
FROM (VALUES (current_database())) AS selected(database_name);

SELECT
  datname,
  numbackends,
  xact_commit,
  xact_rollback,
  blks_read,
  blks_hit,
  temp_bytes,
  deadlocks
FROM pg_stat_database
WHERE datname = current_database();

-- 查看是否安装 postgres_fdw 以及已配置的 foreign server；不显示 user mapping 密码。
SELECT
  extension_name,
  extension_version
FROM (
  SELECT extname AS extension_name, extversion AS extension_version
  FROM pg_extension
  WHERE extname = 'postgres_fdw'
) AS installed_extension;

SELECT
  server.oid AS server_oid,
  server.srvname AS server_name,
  wrapper.fdwname AS foreign_data_wrapper,
  server.srvoptions AS server_options
FROM pg_foreign_server AS server
JOIN pg_foreign_data_wrapper AS wrapper ON wrapper.oid = server.srvfdw
ORDER BY server.srvname;
