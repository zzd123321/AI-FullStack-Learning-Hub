package learning.backend.jpa.course;

import java.util.UUID;

public record LessonView(
        UUID id,
        int position,
        String title) {
}
