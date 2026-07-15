package learning.backend.jpaquery.catalog;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CourseWindowResponse(
        List<CourseSummary> content,
        boolean hasNext,
        Instant nextPublishedAt,
        UUID nextId) {
}
