package learning.backend.jpaquery.catalog;

import java.time.Instant;
import java.util.UUID;

public record CourseSummary(
        UUID id,
        String code,
        String title,
        CourseCategory category,
        CourseStatus status,
        int priceCents,
        Instant publishedAt) {

    static CourseSummary from(CatalogCourse course) {
        return new CourseSummary(
                course.id(),
                course.code(),
                course.title(),
                course.category(),
                course.status(),
                course.priceCents(),
                course.publishedAt());
    }
}
