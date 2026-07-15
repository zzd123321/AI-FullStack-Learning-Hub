package learning.backend.cache.catalog;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CourseCommandService {

    private final CatalogCourseRepository repository;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public CourseCommandService(
            CatalogCourseRepository repository,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.events = events;
        this.clock = Clock.systemUTC();
    }

    @Transactional
    public CourseView update(UUID id, UpdateCourseRequest request) {
        CatalogCourse course = findCourse(id);
        course.update(request.title(), request.priceCents(), Instant.now(clock));
        events.publishEvent(new CourseChangedEvent(id));
        return CourseView.from(course);
    }

    @Transactional
    public void updateThenFail(UUID id, UpdateCourseRequest request) {
        CatalogCourse course = findCourse(id);
        course.update(request.title(), request.priceCents(), Instant.now(clock));
        events.publishEvent(new CourseChangedEvent(id));
        throw new IllegalStateException("模拟事务回滚");
    }

    private CatalogCourse findCourse(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new CourseNotFoundException(id));
    }
}
