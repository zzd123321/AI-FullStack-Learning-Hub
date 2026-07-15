package learning.backend.tasks.notification;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NotificationRequest(
        @NotBlank @Size(max = 120) String recipient,
        @NotBlank @Size(max = 500) String message,
        @Min(0) @Max(2_000) int simulatedDelayMillis,
        boolean simulateFailure) {
}
