CREATE TABLE catalog_course (
    id UUID PRIMARY KEY,
    version BIGINT NOT NULL DEFAULT 0,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(160) NOT NULL,
    category VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    price_cents INTEGER NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_catalog_course_code UNIQUE (code),
    CONSTRAINT ck_catalog_course_price CHECK (price_cents >= 0),
    CONSTRAINT ck_catalog_course_category
        CHECK (category IN ('BACKEND', 'AI', 'FRONTEND')),
    CONSTRAINT ck_catalog_course_status
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);

CREATE INDEX idx_catalog_status_published_id
    ON catalog_course (status, published_at DESC, id DESC);

CREATE INDEX idx_catalog_category_price
    ON catalog_course (category, price_cents);
