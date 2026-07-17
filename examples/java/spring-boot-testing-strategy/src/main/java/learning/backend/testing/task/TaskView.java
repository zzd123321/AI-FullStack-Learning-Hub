package learning.backend.testing.task;

public record TaskView(String id, String title, boolean completed) {
    public static TaskView from(LearningTask task) {
        return new TaskView(task.id(), task.title(), task.completed());
    }
}
