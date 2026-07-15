package learning.backend.jpa.course;

import java.util.UUID;

public record CourseInstructorView(
        UUID id,
        String code,
        String instructorName) {
}
