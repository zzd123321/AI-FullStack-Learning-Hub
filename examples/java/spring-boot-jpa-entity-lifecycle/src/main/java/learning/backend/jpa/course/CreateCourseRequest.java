package learning.backend.jpa.course;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateCourseRequest(
        @NotBlank
        @Size(max = 40)
        @Pattern(regexp = "[A-Z][A-Z0-9-]*", message = "必须由大写字母、数字和短横线组成")
        String code,

        @NotBlank
        @Size(max = 120)
        String title,

        @Positive
        long instructorId,

        @NotEmpty
        List<@Valid CreateLessonRequest> lessons) {
}
