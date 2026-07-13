package learning.backend.collections;

import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class StudyAnalytics {
    private final Set<String> processedSessionIds = new HashSet<>();
    private final Map<String, Integer> minutesByTopic = new LinkedHashMap<>();
    private final Map<String, Set<String>> topicsByLearner = new LinkedHashMap<>();

    public boolean record(LearningSession session) {
        Objects.requireNonNull(session, "学习场次不能为空。");

        if (processedSessionIds.contains(session.sessionId())) {
            return false;
        }

        int currentMinutes = minutesByTopic.getOrDefault(session.topic(), 0);
        int updatedMinutes = Math.addExact(currentMinutes, session.minutes());

        processedSessionIds.add(session.sessionId());
        minutesByTopic.put(session.topic(), updatedMinutes);
        topicsByLearner
                .computeIfAbsent(session.learner(), ignored -> new LinkedHashSet<>())
                .add(session.topic());
        return true;
    }

    public int uniqueSessionCount() {
        return processedSessionIds.size();
    }

    public Map<String, Integer> minutesByTopicSnapshot() {
        return Collections.unmodifiableMap(new LinkedHashMap<>(minutesByTopic));
    }

    public Map<String, Set<String>> topicsByLearnerSnapshot() {
        Map<String, Set<String>> copy = new LinkedHashMap<>();

        for (Map.Entry<String, Set<String>> entry : topicsByLearner.entrySet()) {
            Set<String> topicCopy = Collections.unmodifiableSet(
                    new LinkedHashSet<>(entry.getValue())
            );
            copy.put(entry.getKey(), topicCopy);
        }

        return Collections.unmodifiableMap(copy);
    }
}
