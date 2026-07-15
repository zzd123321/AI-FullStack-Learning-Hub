package learning.backend.security.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final TokenService tokenService;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(
            AuthenticationManager authenticationManager,
            TokenService tokenService,
            SecurityContextRepository securityContextRepository) {
        this.authenticationManager = authenticationManager;
        this.tokenService = tokenService;
        this.securityContextRepository = securityContextRepository;
    }

    @PostMapping("/api/auth/token")
    public TokenResponse token(@Valid @RequestBody LoginRequest request) {
        Authentication authentication = authenticate(request);
        return tokenService.issue(authentication);
    }

    @PostMapping("/session/login")
    public SessionLoginResponse sessionLogin(
            @Valid @RequestBody LoginRequest login,
            HttpServletRequest request,
            HttpServletResponse response) {
        Authentication authentication = authenticate(login);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        securityContextRepository.saveContext(context, request, response);
        return new SessionLoginResponse(authentication.getName(), request.getSession(false).getId());
    }

    private Authentication authenticate(LoginRequest request) {
        var unauthenticated = UsernamePasswordAuthenticationToken.unauthenticated(
                request.username(), request.password());
        return authenticationManager.authenticate(unauthenticated);
    }

    public record SessionLoginResponse(String username, String sessionId) {
    }
}
