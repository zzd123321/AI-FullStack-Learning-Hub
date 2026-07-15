package learning.backend.jpaquery.catalog;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog/courses")
public class CatalogController {

    private final CatalogQueryService queryService;

    public CatalogController(CatalogQueryService queryService) {
        this.queryService = queryService;
    }

    @GetMapping
    public CoursePageResponse search(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) CourseCategory category,
            @RequestParam(required = false) CourseStatus status,
            @RequestParam(required = false) Integer maxPriceCents,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5") int size,
            @RequestParam(defaultValue = "publishedAt") String sort,
            @RequestParam(defaultValue = "DESC") Sort.Direction direction) {
        return queryService.search(
                new CourseSearchCriteria(keyword, category, status, maxPriceCents),
                page,
                size,
                sort,
                direction);
    }

    @GetMapping("/scroll")
    public CourseWindowResponse scroll(
            @RequestParam(required = false) Instant afterPublishedAt,
            @RequestParam(required = false) UUID afterId) {
        return queryService.scrollPublished(afterPublishedAt, afterId);
    }
}
