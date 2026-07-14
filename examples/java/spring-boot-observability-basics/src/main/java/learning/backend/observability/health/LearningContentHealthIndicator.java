package learning.backend.observability.health;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

@Component("learningContent")
public class LearningContentHealthIndicator implements HealthIndicator {

    @Override
    public Health health() {
        return Health.up()
                .withDetail("catalog", "ready")
                .withDetail("lessonCount", 25)
                .build();
    }
}
