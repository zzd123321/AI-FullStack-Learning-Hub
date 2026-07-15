package learning.backend.jpa.course;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateLessonRequest(
        @Positive int position,
        @NotBlank @Size(max = 120) String title) {
}
