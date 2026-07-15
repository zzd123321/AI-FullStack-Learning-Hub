package learning.backend.jpaquery.catalog;

public record CourseSearchCriteria(
        String keyword,
        CourseCategory category,
        CourseStatus status,
        Integer maxPriceCents) {
}
