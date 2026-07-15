-- PostgreSQL 18 升级只读快照；不能替代 pg_upgrade --check。
SELECT version(), current_setting('server_version_num'),
       current_setting('server_encoding'), current_setting('lc_collate'),
       current_setting('lc_ctype'), current_setting('data_checksums');
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SELECT datname, datcollate, datctype, datlocprovider,
       pg_database_size(datname) AS database_bytes
FROM pg_database WHERE datallowconn ORDER BY datname;
SELECT namespace.nspname, procedure.proname,
       language.lanname, procedure.prokind
FROM pg_proc AS procedure
JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
JOIN pg_language AS language ON language.oid = procedure.prolang
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY namespace.nspname, procedure.proname;
SELECT slot_name, slot_type, active, restart_lsn, confirmed_flush_lsn
FROM pg_replication_slots ORDER BY slot_name;
