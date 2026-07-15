-- 第 19 课 PostgreSQL 18：临时分区表与裁剪验证。
-- 所有对象都是 TEMP；仅存在于当前会话，断开后自动清理。

SELECT
  version() AS postgresql_version,
  current_setting('TimeZone') AS session_time_zone,
  current_setting('enable_partition_pruning') AS partition_pruning_enabled;

CREATE TEMP TABLE learning_events (
  id bigint NOT NULL,
  tenant_id bigint NOT NULL,
  occurred_at timestamptz NOT NULL,
  event_type text NOT NULL,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TEMP TABLE learning_events_2026_01
  PARTITION OF learning_events
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

CREATE TEMP TABLE learning_events_2026_02
  PARTITION OF learning_events
  FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

CREATE TEMP TABLE learning_events_default
  PARTITION OF learning_events DEFAULT;

-- 在父表定义后，各现有分区获得对应索引。
CREATE INDEX learning_events_tenant_time_idx
  ON learning_events (tenant_id, occurred_at DESC, id DESC);

INSERT INTO learning_events (id, tenant_id, occurred_at, event_type)
SELECT
  sequence_number,
  40 + (sequence_number % 3),
  TIMESTAMPTZ '2026-01-01 00:00:00+00'
    + (sequence_number * INTERVAL '6 hours'),
  CASE sequence_number % 3
    WHEN 0 THEN 'login'
    WHEN 1 THEN 'profile.updated'
    ELSE 'order.viewed'
  END
FROM generate_series(1, 200) AS generated(sequence_number);

-- 一条明显超出已建月份的数据会进入 DEFAULT；生产环境应对此告警。
INSERT INTO learning_events (id, tenant_id, occurred_at, event_type)
VALUES (1001, 42, TIMESTAMPTZ '2026-04-01 00:00:00+00', 'unexpected.future');

ANALYZE learning_events;

-- tableoid 显示每行实际存储在哪个物理分区。
SELECT
  tableoid::regclass AS physical_partition,
  count(*) AS row_count,
  min(occurred_at) AS earliest_row,
  max(occurred_at) AS latest_row
FROM learning_events
GROUP BY tableoid
ORDER BY 1;

-- 带半开时间范围：计划应裁剪到 2026-02 分区。
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT id, tenant_id, occurred_at, event_type
FROM learning_events
WHERE tenant_id = 42
  AND occurred_at >= TIMESTAMPTZ '2026-02-01 00:00:00+00'
  AND occurred_at <  TIMESTAMPTZ '2026-03-01 00:00:00+00'
ORDER BY occurred_at DESC, id DESC
LIMIT 20;

-- 没有分区键条件：需要考虑所有分区，展示 fan-out 成本。
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT id, tenant_id, occurred_at
FROM learning_events
WHERE tenant_id = 42
ORDER BY occurred_at DESC, id DESC
LIMIT 20;

-- 只读查看临时分区树和边界表达式。
SELECT
  child.relname AS partition_name,
  pg_get_expr(child.relpartbound, child.oid) AS partition_bound
FROM pg_inherits AS inheritance
JOIN pg_class AS parent ON parent.oid = inheritance.inhparent
JOIN pg_class AS child ON child.oid = inheritance.inhrelid
WHERE parent.relname = 'learning_events'
ORDER BY child.relname;
