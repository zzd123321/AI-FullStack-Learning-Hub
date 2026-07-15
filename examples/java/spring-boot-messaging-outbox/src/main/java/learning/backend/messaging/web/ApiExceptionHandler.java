package learning.backend.messaging.web;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    Map<String, String> invalidRequest(MethodArgumentNotValidException exception) {
        return Map.of(
                "code", "INVALID_REQUEST",
                "message", exception.getBindingResult().getAllErrors().get(0).getDefaultMessage());
    }
}
