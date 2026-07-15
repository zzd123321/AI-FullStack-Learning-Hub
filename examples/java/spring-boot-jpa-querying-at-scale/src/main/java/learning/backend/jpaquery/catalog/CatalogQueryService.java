package learning.backend.jpaquery.catalog;

import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.KeysetScrollPosition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.ScrollPosition;
import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Window;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogQueryService {

    private static final int MAX_PAGE_SIZE = 50;
    private static final Set<String> ALLOWED_SORTS =
            Set.of("publishedAt", "title", "priceCents", "code");

    private final CatalogCourseRepository courseRepository;

    public CatalogQueryService(CatalogCourseRepository courseRepository) {
        this.courseRepository = courseRepository;
    }

    @Transactional(readOnly = true)
    public CoursePageResponse search(
            CourseSearchCriteria criteria,
            int page,
            int size,
            String sortProperty,
            Sort.Direction direction) {
        validatePage(page, size);
        if (!ALLOWED_SORTS.contains(sortProperty)) {
            throw new IllegalArgumentException("不支持的排序字段：" + sortProperty);
        }

        Sort sort = Sort.by(direction, sortProperty).and(Sort.by("id"));
        PageRequest pageRequest = PageRequest.of(page, size, sort);
        Page<CatalogCourse> result =
                courseRepository.findAll(CourseSpecifications.from(criteria), pageRequest);

        return new CoursePageResponse(
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages(),
                result.hasNext(),
                result.getContent().stream().map(CourseSummary::from).toList());
    }

    @Transactional(readOnly = true)
    public CourseWindowResponse scrollPublished(Instant afterPublishedAt, UUID afterId) {
        KeysetScrollPosition position = toPosition(afterPublishedAt, afterId);
        Window<CatalogCourse> window =
                courseRepository.findFirst3ByStatusOrderByPublishedAtDescIdDesc(
                        CourseStatus.PUBLISHED,
                        position);

        Instant nextPublishedAt = null;
        UUID nextId = null;
        if (window.hasNext() && !window.isEmpty()) {
            KeysetScrollPosition next =
                    (KeysetScrollPosition) window.positionAt(window.size() - 1);
            nextPublishedAt = (Instant) next.getKeys().get("publishedAt");
            nextId = (UUID) next.getKeys().get("id");
        }

        return new CourseWindowResponse(
                window.getContent().stream().map(CourseSummary::from).toList(),
                window.hasNext(),
                nextPublishedAt,
                nextId);
    }

    Page<CatalogCourse> findPublishedPage(int page, int size) {
        return courseRepository.findPageByStatus(
                CourseStatus.PUBLISHED,
                PageRequest.of(page, size, Sort.by("publishedAt").descending()));
    }

    org.springframework.data.domain.Slice<CatalogCourse> findPublishedSlice(int page, int size) {
        return courseRepository.findSliceByStatus(
                CourseStatus.PUBLISHED,
                PageRequest.of(page, size, Sort.by("publishedAt").descending()));
    }

    private static KeysetScrollPosition toPosition(Instant afterPublishedAt, UUID afterId) {
        if (afterPublishedAt == null && afterId == null) {
            return ScrollPosition.keyset();
        }
        if (afterPublishedAt == null || afterId == null) {
            throw new IllegalArgumentException("afterPublishedAt 与 afterId 必须同时提供");
        }
        return ScrollPosition.forward(Map.of(
                "publishedAt", afterPublishedAt,
                "id", afterId));
    }

    private static void validatePage(int page, int size) {
        if (page < 0) {
            throw new IllegalArgumentException("page 不能小于 0");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("size 必须在 1 到 50 之间");
        }
    }
}
