package learning.backend.collections;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

public final class StudyPlan {
    private static final Comparator<LearningTask> PRIORITY_ORDER =
            Comparator.comparing(LearningTask::completed)
                    .thenComparingInt(LearningTask::estimatedMinutes)
                    .thenComparing(LearningTask::title);

    private final List<LearningTask> tasks = new ArrayList<>();

    public void add(LearningTask task) {
        tasks.add(Objects.requireNonNull(task, "任务不能为空。"));
    }

    public void add(int index, LearningTask task) {
        tasks.add(index, Objects.requireNonNull(task, "任务不能为空。"));
    }

    public LearningTask complete(int index) {
        LearningTask completedTask = tasks.get(index).complete();
        tasks.set(index, completedTask);
        return completedTask;
    }

    public LearningTask remove(int index) {
        return tasks.remove(index);
    }

    public int size() {
        return tasks.size();
    }

    public int totalEstimatedMinutes() {
        int total = 0;

        for (LearningTask task : tasks) {
            total = Math.addExact(total, task.estimatedMinutes());
        }

        return total;
    }

    public List<LearningTask> snapshot() {
        return List.copyOf(tasks);
    }

    public List<LearningTask> prioritizedSnapshot() {
        List<LearningTask> result = new ArrayList<>(tasks);
        result.sort(PRIORITY_ORDER);
        return List.copyOf(result);
    }
}
