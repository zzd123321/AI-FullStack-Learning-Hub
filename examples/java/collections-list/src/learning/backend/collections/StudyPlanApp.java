package learning.backend.collections;

import java.util.List;

public final class StudyPlanApp {
    private StudyPlanApp() {
    }

    public static void main(String[] args) {
        StudyPlan plan = new StudyPlan();
        plan.add(new LearningTask("理解 List 接口", 45, false));
        plan.add(new LearningTask("掌握 ArrayList", 60, false));
        plan.add(1, new LearningTask("比较数组与集合", 30, false));

        List<LearningTask> beforeCompletion = plan.snapshot();
        plan.complete(0);

        System.out.println("原快照仍保持：" + status(beforeCompletion.get(0)));
        System.out.println("当前首项状态：" + status(plan.snapshot().get(0)));
        System.out.println("任务数：" + plan.size());
        System.out.println("预计总时长：" + plan.totalEstimatedMinutes() + " 分钟");

        System.out.println("--- 优先顺序（未完成、短任务在前）---");
        List<LearningTask> prioritized = plan.prioritizedSnapshot();
        for (int index = 0; index < prioritized.size(); index++) {
            LearningTask task = prioritized.get(index);
            System.out.printf("%d. %s / %d 分钟 / %s%n",
                    index + 1,
                    task.title(),
                    task.estimatedMinutes(),
                    status(task));
        }

        try {
            prioritized.add(new LearningTask("越权修改", 10, false));
        } catch (UnsupportedOperationException error) {
            System.out.println("只读快照拒绝修改：" + error.getClass().getSimpleName());
        }
    }

    private static String status(LearningTask task) {
        return task.completed() ? "已完成" : "未完成";
    }
}
