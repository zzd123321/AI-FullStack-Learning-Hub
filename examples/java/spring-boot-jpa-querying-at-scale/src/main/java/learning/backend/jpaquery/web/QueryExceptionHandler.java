package learning.backend.jpaquery.web;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class QueryExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail handleInvalidQuery(IllegalArgumentException exception) {
        ProblemDetail problem =
                ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setTitle("Invalid query");
        problem.setType(URI.create("https://learning.example/problems/invalid-query"));
        problem.setProperty("code", "INVALID_QUERY");
        return problem;
    }
}
