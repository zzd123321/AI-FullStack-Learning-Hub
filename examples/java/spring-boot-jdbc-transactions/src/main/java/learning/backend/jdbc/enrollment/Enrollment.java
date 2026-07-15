package learning.backend.jdbc.enrollment;

import java.time.LocalDateTime;

public record Enrollment(
        String id,
        long accountId,
        String courseCode,
        int credits,
        LocalDateTime enrolledAt) {
}
