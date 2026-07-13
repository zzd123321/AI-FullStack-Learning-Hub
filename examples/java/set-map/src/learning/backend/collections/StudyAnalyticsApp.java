package learning.backend.collections;

import java.util.Map;
import java.util.Set;

public final class StudyAnalyticsApp {
    private StudyAnalyticsApp() {
    }

    public static void main(String[] args) {
        StudyAnalytics analytics = new StudyAnalytics();

        boolean firstAccepted = analytics.record(
                new LearningSession("S-001", "小林", "Java 集合", 45)
        );
        analytics.record(new LearningSession("S-002", "小周", "Java 集合", 30));
        analytics.record(new LearningSession("S-003", "小林", "异常处理", 60));
        boolean duplicateAccepted = analytics.record(
                new LearningSession("S-001", "小林", "Java 集合", 45)
        );

        System.out.println("首次场次已接收：" + firstAccepted);
        System.out.println("重复场次已接收：" + duplicateAccepted);
        System.out.println("唯一场次数：" + analytics.uniqueSessionCount());

        System.out.println("--- 各主题分钟数 ---");
        Map<String, Integer> minutesByTopic = analytics.minutesByTopicSnapshot();
        minutesByTopic.forEach((topic, minutes) ->
                System.out.printf("%s：%d 分钟%n", topic, minutes));

        System.out.println("--- 每位学习者的主题 ---");
        Map<String, Set<String>> topicsByLearner = analytics.topicsByLearnerSnapshot();
        topicsByLearner.forEach((learner, topics) ->
                System.out.println(learner + "：" + topics));

        try {
            topicsByLearner.get("小林").add("越权修改");
        } catch (UnsupportedOperationException error) {
            System.out.println("嵌套快照拒绝修改：" + error.getClass().getSimpleName());
        }
    }
}
