package learning.backend.mvc.web;

import java.net.URI;
import java.time.Instant;
import java.util.List;

import learning.backend.mvc.lesson.LessonConflictException;
import learning.backend.mvc.lesson.LessonNotFoundException;

import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> handleBodyValidation(MethodArgumentNotValidException exception) {
        List<Violation> violations = exception.getBindingResult().getFieldErrors().stream()
                .map(this::toViolation)
                .toList();
        return problem(HttpStatus.BAD_REQUEST, "validation_failed", "请求体校验失败", violations);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ProblemDetail> handleMethodValidation(HandlerMethodValidationException exception) {
        List<Violation> violations = exception.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new Violation(
                                result.getMethodParameter().getParameterName(),
                                message(error),
                                result.getArgument())))
                .toList();
        return problem(HttpStatus.BAD_REQUEST, "constraint_violation", "请求参数约束校验失败", violations);
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, HttpMessageNotReadableException.class})
    ResponseEntity<ProblemDetail> handleUnreadableInput(Exception exception) {
        String detail = exception instanceof MethodArgumentTypeMismatchException mismatch
                ? "参数 " + mismatch.getName() + " 的格式或取值不正确"
                : "请求体不是有效 JSON，或字段类型不正确";
        return problem(HttpStatus.BAD_REQUEST, "invalid_input", detail, List.of());
    }

    @ExceptionHandler(LessonNotFoundException.class)
    ResponseEntity<ProblemDetail> handleNotFound(LessonNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "lesson_not_found", exception.getMessage(), List.of());
    }

    @ExceptionHandler(LessonConflictException.class)
    ResponseEntity<ProblemDetail> handleConflict(LessonConflictException exception) {
        return problem(HttpStatus.CONFLICT, "lesson_conflict", exception.getMessage(), List.of());
    }

    private Violation toViolation(FieldError error) {
        return new Violation(error.getField(), message(error), error.getRejectedValue());
    }

    private static String message(MessageSourceResolvable error) {
        return error.getDefaultMessage() == null ? "输入不符合约束" : error.getDefaultMessage();
    }

    private static ResponseEntity<ProblemDetail> problem(
            HttpStatus status,
            String code,
            String detail,
            List<Violation> violations) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setType(URI.create("https://example.invalid/problems/" + code));
        problem.setProperty("code", code);
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("violations", violations);
        return ResponseEntity.status(status).body(problem);
    }

    public record Violation(String field, String message, Object rejectedValue) {
    }
}
