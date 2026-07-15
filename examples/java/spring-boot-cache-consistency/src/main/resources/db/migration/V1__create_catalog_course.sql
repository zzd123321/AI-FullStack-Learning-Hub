CREATE TABLE catalog_course (
    id UUID PRIMARY KEY,
    version BIGINT NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(160) NOT NULL,
    price_cents INTEGER NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_catalog_course_price CHECK (price_cents >= 0)
);
