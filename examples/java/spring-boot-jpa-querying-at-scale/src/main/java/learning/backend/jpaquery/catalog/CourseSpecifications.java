package learning.backend.jpaquery.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.data.jpa.domain.Specification;

public final class CourseSpecifications {

    private CourseSpecifications() {
    }

    public static Specification<CatalogCourse> from(CourseSearchCriteria criteria) {
        List<Specification<CatalogCourse>> specifications = new ArrayList<>();

        if (criteria.keyword() != null && !criteria.keyword().isBlank()) {
            String pattern = "%" + escapeLike(criteria.keyword().strip().toLowerCase(Locale.ROOT)) + "%";
            specifications.add((root, query, builder) ->
                    builder.like(builder.lower(root.get("title")), pattern, '\\'));
        }
        if (criteria.category() != null) {
            specifications.add((root, query, builder) ->
                    builder.equal(root.get("category"), criteria.category()));
        }
        if (criteria.status() != null) {
            specifications.add((root, query, builder) ->
                    builder.equal(root.get("status"), criteria.status()));
        }
        if (criteria.maxPriceCents() != null) {
            specifications.add((root, query, builder) ->
                    builder.lessThanOrEqualTo(root.get("priceCents"), criteria.maxPriceCents()));
        }

        return Specification.allOf(specifications);
    }

    private static String escapeLike(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }
}
