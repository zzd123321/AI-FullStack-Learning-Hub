package com.ailearninghub.security;

import com.ailearninghub.identity.RoleCode;
import com.ailearninghub.identity.UserEntity;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
  private final JwtProperties properties;
  private final SecretKey signingKey;

  public JwtService(JwtProperties properties) {
    this.properties = properties;
    this.signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(properties.secret()));
  }

  public String createAccessToken(UserEntity user) {
    Instant now = Instant.now();
    List<String> roles = user.getRoles().stream().map(RoleCode::name).sorted().toList();
    return Jwts.builder()
        .subject(user.getId().toString())
        .claim("roles", roles)
        .issuedAt(java.util.Date.from(now))
        .expiration(java.util.Date.from(now.plus(properties.accessTokenMinutes(), ChronoUnit.MINUTES)))
        .signWith(signingKey)
        .compact();
  }

  public Claims parseAccessToken(String token) {
    return Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token).getPayload();
  }

  public long accessTokenSeconds() { return properties.accessTokenMinutes() * 60; }
}
