package learning.backend.cache.catalog;

import java.io.Serial;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

public record CourseView(
        UUID id,
        String code,
        String title,
        int priceCents,
        Instant updatedAt) implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    static CourseView from(CatalogCourse course) {
        return new CourseView(
                course.id(),
                course.code(),
                course.title(),
                course.priceCents(),
                course.updatedAt());
    }
}
