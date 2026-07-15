package learning.backend.jdbc.web;

import java.net.URI;

import learning.backend.jdbc.account.AccountNotFoundException;
import learning.backend.jdbc.account.InsufficientCreditsException;
import learning.backend.jdbc.enrollment.DuplicateEnrollmentException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class DatabaseExceptionHandler {

    @ExceptionHandler(AccountNotFoundException.class)
    ProblemDetail handleNotFound(AccountNotFoundException error) {
        return problem(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", error.getMessage());
    }

    @ExceptionHandler(InsufficientCreditsException.class)
    ProblemDetail handleInsufficientCredits(InsufficientCreditsException error) {
        return problem(HttpStatus.UNPROCESSABLE_CONTENT, "INSUFFICIENT_CREDITS", error.getMessage());
    }

    @ExceptionHandler(DuplicateEnrollmentException.class)
    ProblemDetail handleDuplicateEnrollment(DuplicateEnrollmentException error) {
        return problem(HttpStatus.CONFLICT, "DUPLICATE_ENROLLMENT", error.getMessage());
    }

    private ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setType(URI.create("https://learning.example/problems/" + code.toLowerCase()));
        problem.setProperty("code", code);
        return problem;
    }
}
