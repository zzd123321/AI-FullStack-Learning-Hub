CREATE TABLE instructor (
    id BIGINT PRIMARY KEY,
    display_name VARCHAR(80) NOT NULL
);

CREATE TABLE course (
    id UUID PRIMARY KEY,
    version BIGINT NOT NULL DEFAULT 0,
    code VARCHAR(40) NOT NULL,
    title VARCHAR(120) NOT NULL,
    instructor_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_course_code UNIQUE (code),
    CONSTRAINT fk_course_instructor
        FOREIGN KEY (instructor_id) REFERENCES instructor (id)
);

CREATE INDEX idx_course_instructor ON course (instructor_id);

CREATE TABLE lesson (
    id UUID PRIMARY KEY,
    course_id UUID NOT NULL,
    lesson_position INTEGER NOT NULL,
    title VARCHAR(120) NOT NULL,
    CONSTRAINT ck_lesson_position CHECK (lesson_position > 0),
    CONSTRAINT uk_lesson_course_position UNIQUE (course_id, lesson_position),
    CONSTRAINT fk_lesson_course
        FOREIGN KEY (course_id) REFERENCES course (id)
);

CREATE INDEX idx_lesson_course ON lesson (course_id);
