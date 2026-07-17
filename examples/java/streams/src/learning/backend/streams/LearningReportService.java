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

        // 把三个筛选条件组合成一个有名字的判断行为。
        Predicate<LearningActivity> selected = LearningActivity::completed;
        selected = selected
                .and(activity -> activity.learner().equals(normalizedLearner))
                .and(activity -> activity.minutes() >= minimumMinutes);

        // toList 是终止操作：执行到这里才真正遍历 source。
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

        // map 只取分钟数，reduce 从 0 开始把它们合并为一个总数。
        int totalMinutes = matched.stream()
                .map(LearningActivity::minutes)
                .reduce(0, Math::addExact);

        Map<String, Integer> minutesByTopic = matched.stream()
                .collect(Collectors.toMap(
                        LearningActivity::topic,
                        LearningActivity::minutes,
                        // 同一主题出现多次时累加；没有合并函数会抛重复键异常。
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

        // max 可能找不到任何匹配元素，所以返回 Optional 而不是 null。
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
