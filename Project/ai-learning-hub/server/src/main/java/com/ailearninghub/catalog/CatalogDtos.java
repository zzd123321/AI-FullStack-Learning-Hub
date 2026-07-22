package com.ailearninghub.catalog;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

final class CatalogDtos {
  private CatalogDtos() {}

  record PathRequest(@NotBlank @Size(max = 120) String title,
                     @NotBlank @Size(max = 500) String summary,
                     @Min(0) int sortOrder) {}
  record CourseRequest(@NotNull Long pathId,
                       @NotBlank @Size(max = 120) String title,
                       @NotBlank @Size(max = 500) String summary,
                       @Min(0) int sortOrder) {}
  record KnowledgePointRequest(@NotNull Long courseId,
                               @NotBlank @Size(max = 160) String title,
                               @NotBlank String content,
                               @Min(1) @Max(1440) int estimatedMinutes,
                               @Min(0) int sortOrder) {}

  record PathItem(Long id, String title, String summary, String status, int sortOrder) {
    static PathItem from(LearningPathEntity value) {
      return new PathItem(value.getId(), value.getTitle(), value.getSummary(), value.getStatus().name(), value.getSortOrder());
    }
  }
  record CourseItem(Long id, Long pathId, String title, String summary, String status, int sortOrder) {
    static CourseItem from(CourseEntity value) {
      return new CourseItem(value.getId(), value.getPath().getId(), value.getTitle(), value.getSummary(), value.getStatus().name(), value.getSortOrder());
    }
  }
  record KnowledgePointItem(Long id, Long courseId, String title, String content, int estimatedMinutes, String status, int sortOrder) {
    static KnowledgePointItem from(KnowledgePointEntity value) {
      return new KnowledgePointItem(value.getId(), value.getCourse().getId(), value.getTitle(), value.getContent(),
          value.getEstimatedMinutes(), value.getStatus().name(), value.getSortOrder());
    }
  }
  record PathDetail(PathItem path, List<CourseItem> courses) {}
  record CourseDetail(CourseItem course, List<KnowledgePointItem> knowledgePoints) {}
}
