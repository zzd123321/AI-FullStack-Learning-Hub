package learning.backend.observability.runtime;

import java.util.List;

public record RuntimeInfo(
        String applicationName,
        String environmentLabel,
        String greeting,
        List<String> activeProfiles) {
}
