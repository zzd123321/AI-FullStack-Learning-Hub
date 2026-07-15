package learning.backend.jpa.course;

import java.util.UUID;

public class LessonNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public LessonNotFoundException(UUID lessonId) {
        super("课时不存在：" + lessonId);
    }
}
