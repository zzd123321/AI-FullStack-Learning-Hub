package learning.backend.security.web;

import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping
public class SecurityDemoController {

    @GetMapping("/api/public")
    public Map<String, String> publicEndpoint() {
        return Map.of("message", "public");
    }

    @GetMapping("/api/me")
    public PrincipalView apiMe(Authentication authentication) {
        return PrincipalView.from(authentication);
    }

    @GetMapping("/api/reports")
    @PreAuthorize("hasAuthority('SCOPE_reports.read')")
    public Map<String, String> reports() {
        return Map.of("report", "quarterly-summary");
    }

    @GetMapping("/api/admin/audit")
    public Map<String, String> audit() {
        return Map.of("audit", "admin-only");
    }

    @GetMapping("/session/csrf")
    public CsrfView csrf(CsrfToken token) {
        return new CsrfView(token.getHeaderName(), token.getParameterName(), token.getToken());
    }

    @GetMapping("/session/me")
    public PrincipalView sessionMe(Authentication authentication) {
        return PrincipalView.from(authentication);
    }

    @PostMapping("/session/notes")
    public Map<String, String> saveNote(@RequestBody Map<String, String> body) {
        return Map.of("saved", body.getOrDefault("text", ""));
    }

    public record PrincipalView(String username, java.util.List<String> authorities) {
        static PrincipalView from(Authentication authentication) {
            var authorities = authentication.getAuthorities().stream()
                    .map(authority -> authority.getAuthority())
                    .sorted()
                    .toList();
            return new PrincipalView(authentication.getName(), authorities);
        }
    }

    public record CsrfView(String headerName, String parameterName, String token) {
    }
}
