package learning.backend.testing.task;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    private final TaskService service;

    public TaskController(TaskService service) {
        this.service = service;
    }

    @GetMapping("/{taskId}")
    public TaskView find(@PathVariable String taskId) {
        // Controller 只适配 HTTP，不在这里重新实现业务规则。
        return TaskView.from(service.find(taskId));
    }

    @PostMapping("/{taskId}/completion")
    public TaskView complete(@PathVariable String taskId) {
        return TaskView.from(service.complete(taskId));
    }
}
