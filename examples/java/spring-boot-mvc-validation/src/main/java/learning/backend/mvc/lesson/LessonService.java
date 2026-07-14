package learning.backend.mvc.lesson;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Service;

@Service
public class LessonService {

    private final AtomicLong sequence = new AtomicLong(2);
    private final ConcurrentMap<Long, LessonView> lessons = new ConcurrentHashMap<>();

    public LessonService() {
        lessons.put(1L, new LessonView(1, "java-basics", "Java 基础", LessonLevel.BEGINNER,
                90, List.of("类型", "控制流程"), LocalDate.of(2026, 7, 1)));
        lessons.put(2L, new LessonView(2, "spring-mvc", "Spring MVC", LessonLevel.INTERMEDIATE,
                120, List.of("绑定", "校验"), LocalDate.of(2026, 7, 14)));
    }

    public LessonPage findAll(
            int page,
            int size,
            LessonLevel level,
            LocalDate publishedAfter,
            String clientVersion) {
        List<LessonView> filtered = lessons.values().stream()
                .filter(lesson -> level == null || lesson.level() == level)
                .filter(lesson -> publishedAfter == null || lesson.publishedOn().isAfter(publishedAfter))
                .sorted(Comparator.comparingLong(LessonView::id))
                .toList();

        int from = Math.min(page * size, filtered.size());
        int to = Math.min(from + size, filtered.size());
        return new LessonPage(page, size, filtered.size(), clientVersion, filtered.subList(from, to));
    }

    public LessonView findById(long id) {
        LessonView lesson = lessons.get(id);
        if (lesson == null) {
            throw new LessonNotFoundException(id);
        }
        return lesson;
    }

    public LessonView create(CreateLessonRequest request) {
        boolean duplicate = lessons.values().stream().anyMatch(lesson -> lesson.slug().equals(request.slug()));
        if (duplicate) {
            throw new LessonConflictException(request.slug());
        }

        long id = sequence.incrementAndGet();
        LessonView created = new LessonView(id, request.slug(), request.title(), request.level(),
                request.durationMinutes(), request.topics(), LocalDate.now());
        lessons.put(id, created);
        return created;
    }
}
