package learning.backend.tasks.context;

import java.util.Map;

import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;
import org.springframework.stereotype.Component;

@Component
public class ContextCopyingTaskDecorator implements TaskDecorator {

    @Override
    public Runnable decorate(Runnable runnable) {
        String capturedCorrelationId = RequestContext.correlationIdOr(null);
        Map<String, String> capturedMdc = MDC.getCopyOfContextMap();

        return () -> {
            String previousCorrelationId = RequestContext.correlationIdOr(null);
            Map<String, String> previousMdc = MDC.getCopyOfContextMap();
            try {
                restoreCorrelationId(capturedCorrelationId);
                restoreMdc(capturedMdc);
                runnable.run();
            } finally {
                restoreCorrelationId(previousCorrelationId);
                restoreMdc(previousMdc);
            }
        };
    }

    private static void restoreCorrelationId(String correlationId) {
        if (correlationId == null) {
            RequestContext.clear();
        } else {
            RequestContext.setCorrelationId(correlationId);
        }
    }

    private static void restoreMdc(Map<String, String> context) {
        if (context == null) {
            MDC.clear();
        } else {
            MDC.setContextMap(context);
        }
    }
}
