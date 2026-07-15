-- 第 21 课 PostgreSQL 18：base backup、WAL 归档与 PITR 就绪度只读检查。
-- 不启动备份、不切换 WAL、不创建 restore point，也不修改恢复配置。

SELECT
  version() AS postgresql_version,
  current_database() AS database_name,
  pg_is_in_recovery() AS is_standby,
  current_setting('wal_level') AS wal_level,
  current_setting('archive_mode') AS archive_mode,
  current_setting('archive_command') <> '' AS archive_command_configured,
  current_setting('archive_library') <> '' AS archive_library_configured,
  current_setting('full_page_writes') AS full_page_writes,
  current_setting('max_wal_senders') AS max_wal_senders;

-- Primary 上为当前 WAL 位置；standby 上 current LSN 函数可能不适用，因此分开显示。
SELECT
  CASE WHEN pg_is_in_recovery() THEN NULL ELSE pg_current_wal_lsn() END AS primary_current_lsn,
  pg_last_wal_receive_lsn() AS standby_receive_lsn,
  pg_last_wal_replay_lsn() AS standby_replay_lsn,
  pg_last_xact_replay_timestamp() AS standby_last_replayed_transaction_at,
  clock_timestamp() AS observed_at;

-- 归档成功/失败统计。统计成功不证明对象仍可读取，仍需外部清单与恢复演练。
SELECT
  archived_count,
  last_archived_wal,
  last_archived_time,
  failed_count,
  last_failed_wal,
  last_failed_time,
  stats_reset
FROM pg_stat_archiver;

-- 正在运行的 pg_basebackup 进度；无任务时为空。
SELECT
  pid,
  phase,
  backup_total,
  backup_streamed,
  tablespaces_total,
  tablespaces_streamed
FROM pg_stat_progress_basebackup
ORDER BY pid;

-- slot 可能保留大量 WAL；与归档存储是不同机制，不能互相替代。
SELECT
  slot_name,
  slot_type,
  active,
  restart_lsn,
  confirmed_flush_lsn,
  wal_status,
  safe_wal_size
FROM pg_replication_slots
ORDER BY slot_name;
