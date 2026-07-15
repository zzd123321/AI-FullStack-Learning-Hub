package learning.backend.jpa.course;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RenameCourseRequest(
        @NotBlank @Size(max = 120) String title) {
}
