package learning.backend.jpa.course;

import java.util.UUID;

public class CourseNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public CourseNotFoundException(UUID courseId) {
        super("课程不存在：" + courseId);
    }
}
