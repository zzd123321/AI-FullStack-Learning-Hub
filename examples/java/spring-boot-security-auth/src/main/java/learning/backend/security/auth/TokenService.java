package learning.backend.security.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.stream.Collectors;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

@Service
public class TokenService {

    private static final Duration ACCESS_TOKEN_TTL = Duration.ofMinutes(10);
    private final JwtEncoder encoder;
    private final Clock clock = Clock.systemUTC();

    public TokenService(JwtEncoder encoder) {
        this.encoder = encoder;
    }

    public TokenResponse issue(Authentication authentication) {
        Instant issuedAt = clock.instant();
        Instant expiresAt = issuedAt.plus(ACCESS_TOKEN_TTL);
        String scope = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .filter(authority -> authority.startsWith("SCOPE_"))
                .map(authority -> authority.substring("SCOPE_".length()))
                .sorted()
                .collect(Collectors.joining(" "));
        var authorities = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .filter(authority -> authority.startsWith("ROLE_") || authority.startsWith("SCOPE_"))
                .sorted()
                .toList();
        var claims = JwtClaimsSet.builder()
                .issuer("spring-boot-security-auth")
                .subject(authentication.getName())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("scope", scope)
                .claim("authorities", authorities)
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(claims)).getTokenValue();
        return new TokenResponse(token, "Bearer", expiresAt);
    }
}
