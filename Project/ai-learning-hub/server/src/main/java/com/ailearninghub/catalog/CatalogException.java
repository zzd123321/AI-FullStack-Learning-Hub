package com.ailearninghub.catalog;

import org.springframework.http.HttpStatus;

public class CatalogException extends RuntimeException {
  private final HttpStatus status;
  private final String code;

  private CatalogException(HttpStatus status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  public HttpStatus getStatus() { return status; }
  public String getCode() { return code; }

  public static CatalogException notFound(String resource) {
    return new CatalogException(HttpStatus.NOT_FOUND, "CONTENT_NOT_FOUND", resource + "不存在或尚未发布");
  }

  public static CatalogException invalidState(String message) {
    return new CatalogException(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_CONTENT_STATE", message);
  }
}
