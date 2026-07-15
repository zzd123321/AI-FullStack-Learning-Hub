-- PostgreSQL 18 logical CDC 只读就绪检查；结果取决于当前角色权限。

-- 1. logical decoding 的基础配置与 WAL 容量上限。
SELECT current_setting('wal_level') AS wal_level,
       current_setting('max_replication_slots') AS max_replication_slots,
       current_setting('max_slot_wal_keep_size') AS max_slot_wal_keep_size,
       current_setting('max_wal_senders') AS max_wal_senders;

-- 2. slot 进度与 retained WAL 估算。inactive slot 也可能持续保留 WAL。
SELECT slot_name, plugin, slot_type, database, active,
       restart_lsn, confirmed_flush_lsn,
       wal_status, safe_wal_size, inactive_since,
       failover, synced, invalidation_reason,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal_estimate
FROM pg_replication_slots
ORDER BY slot_name;

-- 3. publication 的操作范围。
SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate
FROM pg_publication
ORDER BY pubname;

-- 4. publication 实际覆盖的表。
SELECT pubname, schemaname, tablename, attnames, rowfilter
FROM pg_publication_tables
ORDER BY pubname, schemaname, tablename;

-- 5. replica identity 影响 UPDATE/DELETE 的旧行标识能力。
SELECT namespace.nspname AS schema_name,
       relation.relname AS table_name,
       CASE relation.relreplident
         WHEN 'd' THEN 'DEFAULT'
         WHEN 'n' THEN 'NOTHING'
         WHEN 'f' THEN 'FULL'
         WHEN 'i' THEN 'INDEX'
       END AS replica_identity
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE relation.relkind IN ('r', 'p')
  AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY namespace.nspname, relation.relname;
