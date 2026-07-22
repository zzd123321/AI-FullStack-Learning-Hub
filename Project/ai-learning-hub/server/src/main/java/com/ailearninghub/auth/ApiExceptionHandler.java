package com.ailearninghub.auth;

import com.ailearninghub.catalog.CatalogException;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(AuthException.class)
  ResponseEntity<Map<String, Object>> authError(AuthException exception) {
    return ResponseEntity.status(exception.getStatus()).body(Map.of(
        "error", Map.of("code", exception.getCode(), "message", exception.getMessage())));
  }

  @ExceptionHandler(CatalogException.class)
  ResponseEntity<Map<String, Object>> catalogError(CatalogException exception) {
    return ResponseEntity.status(exception.getStatus()).body(Map.of(
        "error", Map.of("code", exception.getCode(), "message", exception.getMessage())));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<Map<String, Object>> validationError(MethodArgumentNotValidException exception) {
    var fields = exception.getBindingResult().getFieldErrors().stream()
        .map(error -> Map.of("field", error.getField(), "message", error.getDefaultMessage()))
        .toList();
    return ResponseEntity.badRequest().body(Map.of(
        "error", Map.of("code", "VALIDATION_ERROR", "message", "请求参数无效", "fields", fields)));
  }
}
