package learning.backend.runtime.web;

public record RuntimeView(
        String application,
        String instance,
        String publicBaseUrl,
        String liveness,
        String readiness,
        boolean workerRunning
) {
}
