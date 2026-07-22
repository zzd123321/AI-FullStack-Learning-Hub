package com.ailearninghub.auth;

import org.springframework.http.HttpStatus;

public class AuthException extends RuntimeException {
  private final HttpStatus status;
  private final String code;

  private AuthException(HttpStatus status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  public static AuthException conflict(String message) { return new AuthException(HttpStatus.CONFLICT, "CONFLICT", message); }
  public static AuthException unauthorized() { return new AuthException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "邮箱或密码错误"); }
  public HttpStatus getStatus() { return status; }
  public String getCode() { return code; }
}
