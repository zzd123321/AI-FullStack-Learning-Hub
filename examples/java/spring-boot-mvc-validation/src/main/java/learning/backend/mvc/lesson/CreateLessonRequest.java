package learning.backend.mvc.lesson;

import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateLessonRequest(
        @NotBlank(message = "slug 不能为空")
        @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*", message = "slug 只能使用小写字母、数字和连字符")
        String slug,

        @NotBlank(message = "title 不能为空")
        @Size(max = 80, message = "title 最多 80 个字符")
        String title,

        @NotNull(message = "level 不能为空")
        LessonLevel level,

        @Min(value = 5, message = "durationMinutes 不能小于 5")
        @Max(value = 480, message = "durationMinutes 不能大于 480")
        int durationMinutes,

        @NotEmpty(message = "topics 至少需要一项")
        @Size(max = 10, message = "topics 最多 10 项")
        List<@NotBlank(message = "topic 不能为空") String> topics) {
}
