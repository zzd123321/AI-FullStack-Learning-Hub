package learning.backend.jpa.course;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CourseDetail(
        UUID id,
        long version,
        String code,
        String title,
        Long instructorId,
        String instructorName,
        Instant createdAt,
        List<LessonView> lessons) {
}
