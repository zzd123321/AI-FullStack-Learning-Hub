package learning.backend.springboot.course;

import java.io.Serial;

public class CourseNotFoundException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public CourseNotFoundException(String slug) {
        super("未找到课程：" + slug);
    }
}
