package learning.backend.testing.task;

import org.springframework.stereotype.Service;

@Service
public class TaskService {
    private final TaskRepository repository;

    public TaskService(TaskRepository repository) {
        // 构造注入让普通单元测试可以直接传入 mock，无需启动 Spring。
        this.repository = repository;
    }

    public LearningTask find(String taskId) {
        return repository.findById(taskId)
                .orElseThrow(() -> new TaskNotFoundException(taskId));
    }

    public LearningTask complete(String taskId) {
        LearningTask current = find(taskId);
        LearningTask completed = current.complete();

        // 已完成任务再次调用时不重复保存，保持操作幂等。
        if (completed != current) {
            repository.save(completed);
        }
        return completed;
    }
}
