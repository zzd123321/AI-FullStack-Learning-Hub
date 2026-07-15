package learning.backend.tasks.notification;

import java.util.UUID;

import jakarta.validation.Valid;
import learning.backend.tasks.context.RequestContext;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationTaskService taskService;
    private final TaskRegistry registry;

    public NotificationController(
            NotificationTaskService taskService,
            TaskRegistry registry) {
        this.taskService = taskService;
        this.registry = registry;
    }

    @PostMapping
    public ResponseEntity<TaskSnapshot> submit(
            @Valid @RequestBody NotificationRequest request) {
        UUID taskId = UUID.randomUUID();
        TaskSnapshot queued = registry.create(
                taskId,
                RequestContext.correlationIdOr("system"));
        try {
            taskService.execute(taskId, request);
            return ResponseEntity.accepted().body(queued);
        } catch (TaskRejectedException exception) {
            registry.markRejected(taskId);
            throw exception;
        }
    }

    @GetMapping("/{taskId}")
    public TaskSnapshot status(@PathVariable UUID taskId) {
        return registry.get(taskId);
    }
}
