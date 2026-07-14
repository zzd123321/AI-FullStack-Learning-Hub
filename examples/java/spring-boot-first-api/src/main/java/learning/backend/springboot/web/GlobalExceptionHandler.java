package learning.backend.springboot.web;

import java.net.URI;

import learning.backend.springboot.course.CourseAlreadyExistsException;
import learning.backend.springboot.course.CourseNotFoundException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(CourseNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleNotFound(
            CourseNotFoundException exception,
            WebRequest request) {
        return problem(HttpStatus.NOT_FOUND, "course_not_found", exception.getMessage(), request);
    }

    @ExceptionHandler(CourseAlreadyExistsException.class)
    public ResponseEntity<ProblemDetail> handleConflict(
            CourseAlreadyExistsException exception,
            WebRequest request) {
        return problem(HttpStatus.CONFLICT, "course_already_exists", exception.getMessage(), request);
    }

    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<ProblemDetail> handleBadRequest(Exception exception, WebRequest request) {
        String detail = exception instanceof HttpMessageNotReadableException
                ? "请求体不是有效的 JSON，或字段类型不正确"
                : exception.getMessage();
        return problem(HttpStatus.BAD_REQUEST, "invalid_request", detail, request);
    }

    private static ResponseEntity<ProblemDetail> problem(
            HttpStatus status,
            String code,
            String detail,
            WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setType(URI.create("https://example.invalid/problems/" + code));
        problem.setProperty("code", code);
        problem.setProperty("request", request.getDescription(false));
        return ResponseEntity.status(status).body(problem);
    }
}
