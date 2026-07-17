package learning.backend.testing.web;

import learning.backend.testing.task.TaskNotFoundException;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(TaskNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiError handleNotFound(TaskNotFoundException error) {
        // 在 HTTP 边界把领域失败映射为稳定的协议结构。
        return new ApiError("task_not_found", error.getMessage());
    }
}
