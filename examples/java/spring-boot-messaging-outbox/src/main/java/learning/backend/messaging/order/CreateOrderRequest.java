package learning.backend.messaging.order;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateOrderRequest(
        @NotBlank @Size(max = 80) String customerId,
        @Min(1) @Max(10_000_000) int totalCents) {
}
