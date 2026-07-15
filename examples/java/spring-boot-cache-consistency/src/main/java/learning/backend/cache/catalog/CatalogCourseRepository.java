package learning.backend.cache.catalog;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

interface CatalogCourseRepository extends JpaRepository<CatalogCourse, UUID> {
}
