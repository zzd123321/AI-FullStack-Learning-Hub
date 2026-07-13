package learning.backend.jvm;

import java.util.List;
import java.util.Objects;

public record LearningPlan(String title, List<String> topics) {
    public LearningPlan {
        Objects.requireNonNull(title, "title");
        topics = List.copyOf(topics);
    }
}
