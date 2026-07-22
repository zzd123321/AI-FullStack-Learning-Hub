package com.ailearninghub.catalog;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LearningPathRepository extends JpaRepository<LearningPathEntity, Long> {
  List<LearningPathEntity> findByStatusOrderBySortOrderAsc(ContentStatus status);
  Optional<LearningPathEntity> findByIdAndStatus(Long id, ContentStatus status);
}
