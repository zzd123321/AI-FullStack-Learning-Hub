package learning.backend.streams;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.stream.Collectors;

public final class LearningReportService {
    public LearningReport createReport(
            List<LearningActivity> source,
            String learner,
            int minimumMinutes
    ) {
        Objects.requireNonNull(source, "活动来源不能为空。");
        String normalizedLearner = requireLearner(learner);
        if (minimumMinutes <= 0) {
            throw new IllegalArgumentException("最低分钟数必须大于 0。");
        }

        Predicate<LearningActivity> selected = LearningActivity::completed;
        selected = selected
                .and(activity -> activity.learner().equals(normalizedLearner))
                .and(activity -> activity.minutes() >= minimumMinutes);

        List<LearningActivity> matched = source.stream()
                .filter(Objects::nonNull)
                .filter(selected)
                .toList();

        List<LearningReport.ActivitySummary> summaries = matched.stream()
                .sorted(Comparator.comparingInt(LearningActivity::minutes).reversed())
                .map(activity -> new LearningReport.ActivitySummary(
                        activity.topic(),
                        activity.minutes()
                ))
                .toList();

        int totalMinutes = matched.stream()
                .map(LearningActivity::minutes)
                .reduce(0, Math::addExact);

        Map<String, Integer> minutesByTopic = matched.stream()
                .collect(Collectors.toMap(
                        LearningActivity::topic,
                        LearningActivity::minutes,
                        Math::addExact,
                        LinkedHashMap::new
                ));

        List<String> tags = matched.stream()
                .flatMap(activity -> activity.tags().stream())
                .distinct()
                .sorted()
                .toList();

        return new LearningReport(
                normalizedLearner,
                summaries,
                totalMinutes,
                minutesByTopic,
                tags
        );
    }

    public Optional<LearningActivity> findLongestCompleted(
            List<LearningActivity> source,
            String learner
    ) {
        Objects.requireNonNull(source, "活动来源不能为空。");
        String normalizedLearner = requireLearner(learner);

        return source.stream()
                .filter(Objects::nonNull)
                .filter(LearningActivity::completed)
                .filter(activity -> activity.learner().equals(normalizedLearner))
                .max(Comparator.comparingInt(LearningActivity::minutes));
    }

    private String requireLearner(String learner) {
        if (learner == null || learner.isBlank()) {
            throw new IllegalArgumentException("学习者不能为空。");
        }
        return learner.strip();
    }
}
