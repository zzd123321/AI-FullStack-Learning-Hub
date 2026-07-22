package com.ailearninghub.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Validated
public class AuthController {
  private final AuthService authService;

  public AuthController(AuthService authService) { this.authService = authService; }

  @PostMapping("/register")
  ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
    AuthService.AuthResult result = authService.register(request.email(), request.password(), request.displayName());
    return response(HttpStatus.CREATED, result);
  }

  @PostMapping("/login")
  ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
    return response(HttpStatus.OK, authService.login(request.email(), request.password()));
  }

  @PostMapping("/refresh")
  ResponseEntity<AuthResponse> refresh(HttpServletRequest request) {
    return response(HttpStatus.OK, authService.refresh(cookieValue(request)));
  }

  @PostMapping("/logout")
  ResponseEntity<Void> logout(HttpServletRequest request) {
    authService.logout(cookieValue(request));
    return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, authService.clearRefreshCookie().toString()).build();
  }

  private ResponseEntity<AuthResponse> response(HttpStatus status, AuthService.AuthResult result) {
    return ResponseEntity.status(status)
        .header(HttpHeaders.SET_COOKIE, result.refreshCookie().toString())
        .body(new AuthResponse(result.accessToken(), "Bearer", result.expiresIn(), CurrentUser.from(result.user())));
  }

  private String cookieValue(HttpServletRequest request) {
    if (request.getCookies() == null) return null;
    for (var cookie : request.getCookies()) {
      if (AuthService.REFRESH_COOKIE.equals(cookie.getName())) return cookie.getValue();
    }
    return null;
  }

  public record RegisterRequest(
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 8, max = 72) String password,
      @NotBlank @Size(max = 50) String displayName) {}
  public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
  public record AuthResponse(String accessToken, String tokenType, long expiresIn, CurrentUser user) {}
  public record CurrentUser(Long id, String email, String displayName, java.util.Set<String> roles) {
    static CurrentUser from(com.ailearninghub.identity.UserEntity user) {
      return new CurrentUser(user.getId(), user.getEmail(), user.getDisplayName(),
          user.getRoles().stream().map(Enum::name).collect(java.util.stream.Collectors.toUnmodifiableSet()));
    }
  }
}
