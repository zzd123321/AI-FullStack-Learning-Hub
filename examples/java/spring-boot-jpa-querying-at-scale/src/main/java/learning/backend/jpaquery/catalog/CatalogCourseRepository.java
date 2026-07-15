package learning.backend.jpaquery.catalog;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.KeysetScrollPosition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.Window;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CatalogCourseRepository
        extends JpaRepository<CatalogCourse, UUID>, JpaSpecificationExecutor<CatalogCourse> {

    Optional<CatalogCourse> findByCode(String code);

    @Query("SELECT c FROM CatalogCourse c WHERE c.status = :status")
    Page<CatalogCourse> findPageByStatus(
            @Param("status") CourseStatus status,
            Pageable pageable);

    @Query("SELECT c FROM CatalogCourse c WHERE c.status = :status")
    Slice<CatalogCourse> findSliceByStatus(
            @Param("status") CourseStatus status,
            Pageable pageable);

    Window<CatalogCourse> findFirst3ByStatusOrderByPublishedAtDescIdDesc(
            CourseStatus status,
            KeysetScrollPosition position);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE CatalogCourse c
            SET c.status = :targetStatus,
                c.version = c.version + 1
            WHERE c.status = :sourceStatus
              AND c.publishedAt < :cutoff
            """)
    int bulkTransitionStatus(
            @Param("sourceStatus") CourseStatus sourceStatus,
            @Param("targetStatus") CourseStatus targetStatus,
            @Param("cutoff") Instant cutoff);
}
