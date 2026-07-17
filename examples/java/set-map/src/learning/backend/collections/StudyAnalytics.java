package learning.backend.collections;

import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class StudyAnalytics {
    // Set 用于判重；两个 Map 分别表达“主题到分钟”和“学习者到主题集合”的关系。
    private final Set<String> processedSessionIds = new HashSet<>();
    private final Map<String, Integer> minutesByTopic = new LinkedHashMap<>();
    private final Map<String, Set<String>> topicsByLearner = new LinkedHashMap<>();

    public boolean record(LearningSession session) {
        Objects.requireNonNull(session, "学习场次不能为空。");

        if (processedSessionIds.contains(session.sessionId())) {
            // 相同场次再次到达时不重复累计，让 record 具备简单幂等语义。
            return false;
        }

        int currentMinutes = minutesByTopic.getOrDefault(session.topic(), 0);
        int updatedMinutes = Math.addExact(currentMinutes, session.minutes());

        processedSessionIds.add(session.sessionId());
        minutesByTopic.put(session.topic(), updatedMinutes);
        topicsByLearner
                // 第一次见到学习者时创建集合，之后复用已有集合。
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
        // 只复制外层 Map 不够：调用方仍可修改里面的 Set，因此需要逐层复制和封装。
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
