CREATE TABLE purchase_order (
    id UUID PRIMARY KEY,
    customer_id VARCHAR(80) NOT NULL,
    total_cents INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_purchase_order_total CHECK (total_cents > 0)
);

CREATE TABLE outbox_event (
    id UUID PRIMARY KEY,
    version BIGINT NOT NULL,
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id VARCHAR(80) NOT NULL,
    event_type VARCHAR(120) NOT NULL,
    payload VARCHAR(4000) NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempts INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_until TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    last_error VARCHAR(500)
);

CREATE INDEX idx_outbox_publishable
    ON outbox_event (status, next_attempt_at, created_at);

CREATE INDEX idx_outbox_expired_lease
    ON outbox_event (status, locked_until);
