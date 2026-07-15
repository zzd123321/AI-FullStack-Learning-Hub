-- 第 25 课 PostgreSQL 18：事故只读快照。
-- 不 cancel/terminate backend，不 promote、reload、reset 统计或修改配置。

SELECT version(), current_database(), pg_is_in_recovery(), session_user,
       current_user, clock_timestamp() AS observed_at,
       CASE WHEN pg_is_in_recovery() THEN NULL ELSE pg_current_wal_lsn() END AS primary_lsn,
       pg_last_wal_receive_lsn() AS receive_lsn,
       pg_last_wal_replay_lsn() AS replay_lsn;

SELECT pid, usename, application_name, client_addr, state,
       xact_start, query_start, state_change,
       wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocking_pids,
       LEFT(query, 300) AS current_query
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid()
ORDER BY xact_start NULLS LAST, query_start NULLS LAST;

SELECT lock.pid, lock.locktype, lock.mode, lock.granted, lock.waitstart,
       lock.relation::regclass AS relation_name,
       activity.application_name, activity.state
FROM pg_locks AS lock
LEFT JOIN pg_stat_activity AS activity ON activity.pid = lock.pid
WHERE lock.database = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY lock.granted, lock.waitstart NULLS LAST, lock.pid;

SELECT pid, application_name, client_addr, state, sync_state,
       sent_lsn, write_lsn, flush_lsn, replay_lsn,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication
ORDER BY application_name, client_addr;

SELECT slot_name, slot_type, active, active_pid, restart_lsn,
       confirmed_flush_lsn, wal_status, safe_wal_size
FROM pg_replication_slots
ORDER BY slot_name;

SELECT datname, numbackends, xact_commit, xact_rollback,
       blks_read, blks_hit, temp_files, temp_bytes, deadlocks, stats_reset
FROM pg_stat_database
WHERE datname = current_database();

SELECT archived_count, last_archived_wal, last_archived_time,
       failed_count, last_failed_wal, last_failed_time, stats_reset
FROM pg_stat_archiver;
