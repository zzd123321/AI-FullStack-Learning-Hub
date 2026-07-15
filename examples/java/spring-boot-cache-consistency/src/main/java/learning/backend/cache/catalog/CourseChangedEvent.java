package learning.backend.cache.catalog;

import java.util.UUID;

public record CourseChangedEvent(UUID courseId) {
}
