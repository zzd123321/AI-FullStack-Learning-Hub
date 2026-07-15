package learning.backend.jpaquery.catalog;

import java.time.Instant;

import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogBatchService {

    private static final int FLUSH_CHUNK_SIZE = 20;

    private final CatalogCourseRepository courseRepository;
    private final EntityManager entityManager;

    public CatalogBatchService(
            CatalogCourseRepository courseRepository,
            EntityManager entityManager) {
        this.courseRepository = courseRepository;
        this.entityManager = entityManager;
    }

    @Transactional
    public int insertGeneratedCourses(String codePrefix, int count) {
        if (count < 1 || count > 200) {
            throw new IllegalArgumentException("count 必须在 1 到 200 之间");
        }

        for (int index = 1; index <= count; index++) {
            courseRepository.save(new CatalogCourse(
                    codePrefix + "-" + index,
                    "批量课程 " + index,
                    CourseCategory.BACKEND,
                    CourseStatus.DRAFT,
                    1000 + index,
                    Instant.parse("2026-01-01T00:00:00Z").plusSeconds(index)));

            if (index % FLUSH_CHUNK_SIZE == 0) {
                entityManager.flush();
                entityManager.clear();
            }
        }
        entityManager.flush();
        entityManager.clear();
        return count;
    }

    @Transactional
    public int archiveDraftsBefore(Instant cutoff) {
        return courseRepository.bulkTransitionStatus(
                CourseStatus.DRAFT,
                CourseStatus.ARCHIVED,
                cutoff);
    }
}
