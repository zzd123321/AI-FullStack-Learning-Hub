CREATE TABLE processed_message (
    id UUID PRIMARY KEY,
    consumer_name VARCHAR(100) NOT NULL,
    event_id UUID NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_processed_consumer_event UNIQUE (consumer_name, event_id)
);

CREATE TABLE order_projection (
    order_id UUID PRIMARY KEY,
    applications INTEGER NOT NULL,
    last_event_at TIMESTAMP WITH TIME ZONE NOT NULL
);
