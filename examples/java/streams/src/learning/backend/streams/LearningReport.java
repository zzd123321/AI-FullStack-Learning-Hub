package learning.backend.streams;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record LearningReport(
        String learner,
        List<ActivitySummary> activities,
        int totalMinutes,
        Map<String, Integer> minutesByTopic,
        List<String> tags
) {
    public LearningReport {
        if (learner == null || learner.isBlank()) {
            throw new IllegalArgumentException("学习者不能为空。");
        }
        learner = learner.strip();
        activities = List.copyOf(activities);
        minutesByTopic = Collections.unmodifiableMap(
                new LinkedHashMap<>(minutesByTopic)
        );
        tags = List.copyOf(tags);
    }

    public record ActivitySummary(String topic, int minutes) {
    }
}
