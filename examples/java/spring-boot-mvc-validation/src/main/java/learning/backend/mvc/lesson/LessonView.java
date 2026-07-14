package learning.backend.mvc.lesson;

import java.time.LocalDate;
import java.util.List;

public record LessonView(
        long id,
        String slug,
        String title,
        LessonLevel level,
        int durationMinutes,
        List<String> topics,
        LocalDate publishedOn) {

    public LessonView {
        topics = List.copyOf(topics);
    }
}
