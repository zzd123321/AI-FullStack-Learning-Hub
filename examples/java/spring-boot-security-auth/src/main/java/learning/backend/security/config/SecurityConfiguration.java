package learning.backend.security.config;

import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import learning.backend.security.auth.JsonAccessDeniedHandler;
import learning.backend.security.auth.JsonAuthenticationEntryPoint;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

@Configuration
@EnableMethodSecurity
public class SecurityConfiguration {

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    UserDetailsService userDetailsService(PasswordEncoder encoder) {
        var reader = User.withUsername("reader")
                .password(encoder.encode("reader-password"))
                .authorities("ROLE_USER", "SCOPE_reports.read")
                .build();
        var admin = User.withUsername("admin")
                .password(encoder.encode("admin-password"))
                .authorities("ROLE_ADMIN", "SCOPE_reports.read", "SCOPE_reports.write")
                .build();
        return new InMemoryUserDetailsManager(reader, admin);
    }

    @Bean
    AuthenticationManager authenticationManager(UserDetailsService users, PasswordEncoder encoder) {
        var provider = new DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    @Order(1)
    SecurityFilterChain apiChain(
            HttpSecurity http,
            JwtAuthenticationConverter jwtAuthenticationConverter,
            JsonAuthenticationEntryPoint entryPoint,
            JsonAccessDeniedHandler deniedHandler) throws Exception {
        // 这条链只匹配 /api/**，采用 Bearer JWT，不创建服务器 Session。
        http
                .securityMatcher("/api/**")
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(csrf -> csrf.disable())
                // 这里关闭 CSRF 的前提是 API 只从 Authorization header 取 Bearer token，
                // 浏览器不会像 Cookie 那样自动附加它；若改用 Cookie，必须重新评估。
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/api/public", "/api/auth/token").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter))
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(deniedHandler))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(deniedHandler));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain sessionChain(
            HttpSecurity http,
            SecurityContextRepository repository,
            JsonAuthenticationEntryPoint entryPoint,
            JsonAccessDeniedHandler deniedHandler) throws Exception {
        // JavaScript 需要读取 CSRF token 并放入请求头，因此示例 Cookie 不是 HttpOnly。
        // 认证 Session Cookie 仍应保持 HttpOnly，两类 Cookie 不能混为一谈。
        var csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        http
                .securityMatcher("/session/**")
                .securityContext(context -> context
                        .requireExplicitSave(true)
                        .securityContextRepository(repository))
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfRepository)
                        .ignoringRequestMatchers("/session/login"))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/session/login", "/session/csrf").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(deniedHandler));
        return http.build();
    }

    @Bean
    @Order(3)
    SecurityFilterChain fallbackChain(HttpSecurity http) throws Exception {
        // 未被前两条链覆盖的请求默认拒绝，避免新增路径意外公开。
        http.authorizeHttpRequests(authorize -> authorize
                .requestMatchers("/error").permitAll()
                .anyRequest().denyAll());
        return http.build();
    }

    @Bean
    SecretKey jwtSecretKey(@Value("${app.security.jwt-secret}") String secret) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            throw new IllegalArgumentException("app.security.jwt-secret must contain at least 32 UTF-8 bytes");
        }
        return new SecretKeySpec(keyBytes, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) {
        return NimbusJwtEncoder.withSecretKey(key).algorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key) {
        return NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        var authoritiesConverter = new JwtGrantedAuthoritiesConverter();
        authoritiesConverter.setAuthoritiesClaimName("authorities");
        authoritiesConverter.setAuthorityPrefix("");
        var authenticationConverter = new JwtAuthenticationConverter();
        authenticationConverter.setJwtGrantedAuthoritiesConverter(authoritiesConverter);
        return authenticationConverter;
    }
}
