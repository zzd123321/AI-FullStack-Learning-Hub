package learning.backend.jpaquery.catalog;

import java.util.List;

public record CoursePageResponse(
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean hasNext,
        List<CourseSummary> content) {
}
