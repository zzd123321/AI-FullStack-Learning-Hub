package learning.backend.mvc.lesson;

import java.io.Serial;

public class LessonConflictException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public LessonConflictException(String slug) {
        super("课程 slug 已存在：" + slug);
    }
}
