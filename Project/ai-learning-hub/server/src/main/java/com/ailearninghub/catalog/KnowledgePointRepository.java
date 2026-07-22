package com.ailearninghub.catalog;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface KnowledgePointRepository extends JpaRepository<KnowledgePointEntity, Long> {
  List<KnowledgePointEntity> findByCourseIdAndStatusOrderBySortOrderAsc(Long courseId, ContentStatus status);
  Optional<KnowledgePointEntity> findByIdAndStatus(Long id, ContentStatus status);
}
