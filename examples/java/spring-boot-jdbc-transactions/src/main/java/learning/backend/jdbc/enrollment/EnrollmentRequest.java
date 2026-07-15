package learning.backend.jdbc.enrollment;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record EnrollmentRequest(
        @NotBlank
        @Size(max = 40)
        @Pattern(regexp = "[A-Z][A-Z0-9-]*", message = "必须由大写字母、数字和短横线组成")
        String courseCode,

        @Min(1)
        @Max(20)
        int credits) {
}
