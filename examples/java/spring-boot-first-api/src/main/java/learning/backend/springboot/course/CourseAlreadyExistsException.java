package learning.backend.springboot.course;

import java.io.Serial;

public class CourseAlreadyExistsException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public CourseAlreadyExistsException(String slug) {
        super("课程已存在：" + slug);
    }
}
