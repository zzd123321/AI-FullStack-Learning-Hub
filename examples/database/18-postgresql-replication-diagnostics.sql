-- 第 18 课 PostgreSQL 18：只读复制诊断。
-- primary 侧 pg_stat_replication 有行；standby 侧 recovery 函数/WAL receiver 更有意义。

SELECT
  version() AS postgresql_version,
  current_database() AS database_name,
  pg_is_in_recovery() AS is_standby,
  current_setting('hot_standby') AS hot_standby,
  current_setting('synchronous_commit') AS synchronous_commit,
  current_setting('synchronous_standby_names') AS synchronous_standby_names;

-- Primary 侧：每个 WAL sender 观察 sent/write/flush/replay 位置和 lag。
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  sync_state,
  sent_lsn,
  write_lsn,
  flush_lsn,
  replay_lsn,
  write_lag,
  flush_lag,
  replay_lag
FROM pg_stat_replication
ORDER BY application_name, client_addr;

-- Standby 侧：receive 与 replay gap。Primary 上 recovery 函数通常返回 NULL。
SELECT
  pg_last_wal_receive_lsn() AS receive_lsn,
  pg_last_wal_replay_lsn() AS replay_lsn,
  pg_wal_lsn_diff(
    pg_last_wal_receive_lsn(),
    pg_last_wal_replay_lsn()
  ) AS received_not_replayed_bytes,
  pg_last_xact_replay_timestamp() AS last_replayed_transaction_at,
  clock_timestamp() - pg_last_xact_replay_timestamp()
    AS time_since_last_replayed_transaction;

-- Standby WAL receiver；primary 上通常为空。
SELECT
  pid,
  status,
  receive_start_lsn,
  written_lsn,
  flushed_lsn,
  last_msg_send_time,
  last_msg_receipt_time,
  latest_end_lsn,
  latest_end_time,
  sender_host,
  sender_port
FROM pg_stat_wal_receiver;

-- Hot Standby recovery conflict 累计统计；不能只看当前是否有被取消查询。
SELECT
  datname,
  confl_tablespace,
  confl_lock,
  confl_snapshot,
  confl_bufferpin,
  confl_deadlock
FROM pg_stat_database_conflicts
WHERE datname IS NOT NULL
ORDER BY datname;

-- Primary 侧 replication slot 的 WAL 保留风险；无 slot 时为空。
SELECT
  slot_name,
  slot_type,
  active,
  active_pid,
  restart_lsn,
  confirmed_flush_lsn,
  wal_status,
  safe_wal_size
FROM pg_replication_slots
ORDER BY slot_name;
