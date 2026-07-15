CREATE TABLE learning_account (
    id BIGINT PRIMARY KEY,
    learner_name VARCHAR(100) NOT NULL,
    available_credits INTEGER NOT NULL CHECK (available_credits >= 0)
);

CREATE TABLE course_enrollment (
    id VARCHAR(36) PRIMARY KEY,
    account_id BIGINT NOT NULL,
    course_code VARCHAR(40) NOT NULL,
    credits INTEGER NOT NULL CHECK (credits > 0),
    enrolled_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_enrollment_account
        FOREIGN KEY (account_id) REFERENCES learning_account (id),
    CONSTRAINT uk_enrollment_account_course
        UNIQUE (account_id, course_code)
);

CREATE TABLE credit_ledger (
    id VARCHAR(36) PRIMARY KEY,
    account_id BIGINT NOT NULL,
    credit_delta INTEGER NOT NULL,
    reason VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_ledger_account
        FOREIGN KEY (account_id) REFERENCES learning_account (id)
);

CREATE INDEX idx_enrollment_account
    ON course_enrollment (account_id);

CREATE INDEX idx_ledger_account
    ON credit_ledger (account_id);
