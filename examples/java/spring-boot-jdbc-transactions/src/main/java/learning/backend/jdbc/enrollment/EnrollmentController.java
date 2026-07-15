package learning.backend.jdbc.enrollment;

import java.net.URI;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/accounts/{accountId}")
public class EnrollmentController {

    private final EnrollmentService enrollmentService;

    public EnrollmentController(EnrollmentService enrollmentService) {
        this.enrollmentService = enrollmentService;
    }

    @GetMapping
    public AccountOverview findOverview(@PathVariable @Positive long accountId) {
        return enrollmentService.findOverview(accountId);
    }

    @PostMapping("/enrollments")
    public ResponseEntity<Enrollment> enroll(
            @PathVariable @Positive long accountId,
            @Valid @RequestBody EnrollmentRequest request) {
        Enrollment enrollment = enrollmentService.enroll(accountId, request);
        URI location = URI.create("/api/accounts/%d/enrollments/%s"
                .formatted(accountId, enrollment.id()));
        return ResponseEntity.created(location).body(enrollment);
    }
}
