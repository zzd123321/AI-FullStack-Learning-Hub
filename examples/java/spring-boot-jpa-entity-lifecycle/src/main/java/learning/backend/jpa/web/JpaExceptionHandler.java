package learning.backend.jpa.web;

import java.net.URI;

import learning.backend.jpa.course.CourseNotFoundException;
import learning.backend.jpa.course.DuplicateCourseCodeException;
import learning.backend.jpa.course.InstructorNotFoundException;
import learning.backend.jpa.course.LessonNotFoundException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class JpaExceptionHandler {

    @ExceptionHandler({
            CourseNotFoundException.class,
            InstructorNotFoundException.class,
            LessonNotFoundException.class
    })
    ProblemDetail handleNotFound(RuntimeException exception) {
        return problem(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", exception.getMessage());
    }

    @ExceptionHandler(DuplicateCourseCodeException.class)
    ProblemDetail handleDuplicate(DuplicateCourseCodeException exception) {
        return problem(HttpStatus.CONFLICT, "DUPLICATE_COURSE_CODE", exception.getMessage());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail handleConstraint(DataIntegrityViolationException exception) {
        return problem(
                HttpStatus.CONFLICT,
                "DATA_CONSTRAINT_VIOLATION",
                "数据违反唯一性、外键或检查约束。");
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setType(URI.create("https://learning.example/problems/" + code.toLowerCase()));
        problem.setProperty("code", code);
        return problem;
    }
}
