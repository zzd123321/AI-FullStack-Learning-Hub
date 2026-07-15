package learning.backend.tasks.web;

import java.util.Map;

import learning.backend.tasks.notification.TaskNotFoundException;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class TaskExceptionHandler {

    @ExceptionHandler(TaskNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    Map<String, String> notFound(TaskNotFoundException exception) {
        return Map.of("code", "TASK_NOT_FOUND", "message", exception.getMessage());
    }

    @ExceptionHandler(TaskRejectedException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    Map<String, String> rejected() {
        return Map.of(
                "code", "TASK_CAPACITY_EXHAUSTED",
                "message", "异步任务暂时过载，请稍后重试");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    Map<String, String> invalid(MethodArgumentNotValidException exception) {
        return Map.of(
                "code", "INVALID_REQUEST",
                "message", exception.getBindingResult().getAllErrors().get(0).getDefaultMessage());
    }
}
