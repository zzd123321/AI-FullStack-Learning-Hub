package learning.backend.jpa.course;

import java.util.UUID;

public record CourseCard(
        UUID id,
        String code,
        String title,
        String instructorName,
        long lessonCount) {
}
