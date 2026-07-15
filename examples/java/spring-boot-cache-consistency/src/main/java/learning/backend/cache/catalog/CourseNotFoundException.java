package learning.backend.cache.catalog;

import java.io.Serial;
import java.util.UUID;

public class CourseNotFoundException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public CourseNotFoundException(UUID id) {
        super("课程不存在: " + id);
    }
}
