package learning.backend.cache.catalog;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CourseLoader {

    private final CatalogCourseRepository repository;
    private final Duration simulatedDelay;
    private final AtomicLong databaseLoads = new AtomicLong();

    public CourseLoader(
            CatalogCourseRepository repository,
            @Value("${app.catalog.simulated-load-delay:0ms}") Duration simulatedDelay) {
        this.repository = repository;
        this.simulatedDelay = simulatedDelay;
    }

    @Transactional(readOnly = true)
    public CourseView load(UUID id) {
        databaseLoads.incrementAndGet();
        pauseForDemonstration();
        return repository.findById(id)
                .map(CourseView::from)
                .orElseThrow(() -> new CourseNotFoundException(id));
    }

    public long databaseLoadCount() {
        return databaseLoads.get();
    }

    public void resetDatabaseLoadCount() {
        databaseLoads.set(0);
    }

    private void pauseForDemonstration() {
        if (simulatedDelay.isZero() || simulatedDelay.isNegative()) {
            return;
        }
        try {
            Thread.sleep(simulatedDelay.toMillis());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("读取被中断", exception);
        }
    }
}
