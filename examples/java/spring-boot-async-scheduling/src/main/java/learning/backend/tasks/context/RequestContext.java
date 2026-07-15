package learning.backend.tasks.context;

public final class RequestContext {

    private static final ThreadLocal<String> CORRELATION_ID = new ThreadLocal<>();

    private RequestContext() {
    }

    public static void setCorrelationId(String correlationId) {
        CORRELATION_ID.set(correlationId);
    }

    public static String correlationIdOr(String fallback) {
        String value = CORRELATION_ID.get();
        return value == null ? fallback : value;
    }

    public static void clear() {
        CORRELATION_ID.remove();
    }
}
