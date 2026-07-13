package learning.backend.memory;

import java.util.List;
import java.util.Objects;

public record LearningSnapshot(
        int version,
        String course,
        List<String> topics
) {
    public LearningSnapshot {
        if (version <= 0) {
            throw new IllegalArgumentException("version 必须大于 0");
        }
        Objects.requireNonNull(course, "course");
        topics = List.copyOf(topics);
    }
}
