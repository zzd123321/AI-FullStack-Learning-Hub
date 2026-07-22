package com.ailearninghub.catalog;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseRepository extends JpaRepository<CourseEntity, Long> {
  List<CourseEntity> findByPathIdAndStatusOrderBySortOrderAsc(Long pathId, ContentStatus status);
  Optional<CourseEntity> findByIdAndStatus(Long id, ContentStatus status);
}
