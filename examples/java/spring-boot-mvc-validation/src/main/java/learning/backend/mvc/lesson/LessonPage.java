package learning.backend.mvc.lesson;

import java.util.List;

public record LessonPage(
        int page,
        int size,
        long totalElements,
        String clientVersion,
        List<LessonView> items) {

    public LessonPage {
        items = List.copyOf(items);
    }
}
