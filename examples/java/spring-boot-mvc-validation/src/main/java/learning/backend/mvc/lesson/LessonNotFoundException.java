package learning.backend.mvc.lesson;

import java.io.Serial;

public class LessonNotFoundException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public LessonNotFoundException(long id) {
        super("未找到课程：" + id);
    }
}
