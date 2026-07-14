package learning.backend.observability.runtime;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

@Component
public class RuntimeMetrics {

    private final Counter requests;

    public RuntimeMetrics(MeterRegistry registry) {
        this.requests = Counter.builder("learning.runtime.requests")
                .description("Number of requests for the runtime information endpoint")
                .tag("endpoint", "runtime")
                .register(registry);
    }

    public void recordRequest() {
        requests.increment();
    }
}
