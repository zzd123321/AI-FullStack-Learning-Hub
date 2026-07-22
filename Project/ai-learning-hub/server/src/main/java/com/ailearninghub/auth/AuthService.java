package com.ailearninghub.auth;

import com.ailearninghub.identity.RefreshTokenEntity;
import com.ailearninghub.identity.RefreshTokenRepository;
import com.ailearninghub.identity.UserEntity;
import com.ailearninghub.identity.UserRepository;
import com.ailearninghub.identity.UserStatus;
import com.ailearninghub.security.JwtProperties;
import com.ailearninghub.security.JwtService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import org.springframework.http.ResponseCookie;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  public static final String REFRESH_COOKIE = "learning_refresh_token";
  private static final SecureRandom RANDOM = new SecureRandom();

  private final UserRepository users;
  private final RefreshTokenRepository refreshTokens;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;
  private final JwtProperties jwtProperties;

  public AuthService(UserRepository users, RefreshTokenRepository refreshTokens, PasswordEncoder passwordEncoder,
      JwtService jwtService, JwtProperties jwtProperties) {
    this.users = users;
    this.refreshTokens = refreshTokens;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
    this.jwtProperties = jwtProperties;
  }

  @Transactional
  public AuthResult register(String email, String password, String displayName) {
    String normalizedEmail = email.trim().toLowerCase(java.util.Locale.ROOT);
    if (users.existsByEmail(normalizedEmail)) throw AuthException.conflict("该邮箱已被注册");
    UserEntity user = users.save(new UserEntity(normalizedEmail, passwordEncoder.encode(password), displayName.trim()));
    return issueSession(user);
  }

  @Transactional
  public AuthResult login(String email, String password) {
    UserEntity user = users.findByEmail(email.trim().toLowerCase(java.util.Locale.ROOT)).orElseThrow(AuthException::unauthorized);
    if (user.getStatus() != UserStatus.ACTIVE || !passwordEncoder.matches(password, user.getPasswordHash())) {
      throw AuthException.unauthorized();
    }
    return issueSession(user);
  }

  @Transactional
  public AuthResult refresh(String rawToken) {
    RefreshTokenEntity current = findUsableToken(rawToken);
    UserEntity user = current.getUser();
    if (user.getStatus() != UserStatus.ACTIVE) throw AuthException.unauthorized();
    TokenValue next = newTokenValue();
    RefreshTokenEntity replacement = refreshTokens.save(new RefreshTokenEntity(
        user, hash(next.raw()), Instant.now().plus(jwtProperties.refreshTokenDays(), ChronoUnit.DAYS)));
    current.revoke(Instant.now(), replacement);
    return new AuthResult(jwtService.createAccessToken(user), jwtService.accessTokenSeconds(), user, refreshCookie(next.raw()));
  }

  @Transactional
  public void logout(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) return;
    refreshTokens.findByTokenHash(hash(rawToken)).ifPresent(token -> token.revoke(Instant.now()));
  }

  public ResponseCookie clearRefreshCookie() {
    return ResponseCookie.from(REFRESH_COOKIE, "").path("/api/v1/auth").httpOnly(true)
        .secure(jwtProperties.secureCookie()).sameSite("Strict").maxAge(0).build();
  }

  private AuthResult issueSession(UserEntity user) {
    TokenValue refresh = newTokenValue();
    refreshTokens.save(new RefreshTokenEntity(user, hash(refresh.raw()),
        Instant.now().plus(jwtProperties.refreshTokenDays(), ChronoUnit.DAYS)));
    return new AuthResult(jwtService.createAccessToken(user), jwtService.accessTokenSeconds(), user, refreshCookie(refresh.raw()));
  }

  private RefreshTokenEntity findUsableToken(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) throw AuthException.unauthorized();
    RefreshTokenEntity token = refreshTokens.findByTokenHash(hash(rawToken)).orElseThrow(AuthException::unauthorized);
    if (!token.isUsable(Instant.now())) throw AuthException.unauthorized();
    return token;
  }

  private ResponseCookie refreshCookie(String rawToken) {
    return ResponseCookie.from(REFRESH_COOKIE, rawToken).path("/api/v1/auth").httpOnly(true)
        .secure(jwtProperties.secureCookie()).sameSite("Strict")
        .maxAge(java.time.Duration.ofDays(jwtProperties.refreshTokenDays())).build();
  }

  private static TokenValue newTokenValue() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return new TokenValue(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
  }

  private static String hash(String value) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return java.util.HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 不可用", exception);
    }
  }

  private record TokenValue(String raw) {}
  public record AuthResult(String accessToken, long expiresIn, UserEntity user, ResponseCookie refreshCookie) {}
}
