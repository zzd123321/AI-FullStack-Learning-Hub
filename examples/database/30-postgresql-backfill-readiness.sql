-- PostgreSQL 18 在线回填只读基线；请在 canary 前后用同一口径比较。

-- 1. 版本、WAL、超时与 autovacuum 基础配置。
SELECT version(),
       current_setting('wal_level') AS wal_level,
       current_setting('max_wal_size') AS max_wal_size,
       current_setting('statement_timeout') AS statement_timeout,
       current_setting('lock_timeout') AS lock_timeout,
       current_setting('autovacuum') AS autovacuum;

-- 2. 表规模、live/dead tuple 估算和维护时间。
SELECT schemaname, relname,
       n_live_tup, n_dead_tup, n_mod_since_analyze,
       last_autovacuum, last_autoanalyze,
       pg_total_relation_size(relid) AS total_bytes
FROM pg_stat_user_tables
ORDER BY total_bytes DESC;

-- 3. 长事务可能阻碍旧版本清理。query 仅展示前 120 个字符。
SELECT pid, usename, state,
       clock_timestamp() - xact_start AS transaction_age,
       wait_event_type, wait_event,
       left(query, 120) AS query_sample
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
  AND pid <> pg_backend_pid()
ORDER BY xact_start;

-- 4. 物理副本发送/写入/刷盘/回放位置与 lag。
SELECT application_name, state, sync_state,
       sent_lsn, write_lsn, flush_lsn, replay_lsn,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication
ORDER BY application_name;

-- 5. logical slot 会因落后持续保留 WAL，回填写放大会压缩磁盘 runway。
SELECT slot_name, active, restart_lsn, confirmed_flush_lsn,
       wal_status, safe_wal_size, inactive_since,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal_estimate
FROM pg_replication_slots
WHERE slot_type = 'logical'
ORDER BY slot_name;
