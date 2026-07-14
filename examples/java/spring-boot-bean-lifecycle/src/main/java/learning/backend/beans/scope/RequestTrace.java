package learning.backend.beans.scope;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.context.annotation.ScopedProxyMode;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

@Component
@RequestScope(proxyMode = ScopedProxyMode.TARGET_CLASS)
public class RequestTrace {

    private final String id = UUID.randomUUID().toString();
    private final AtomicInteger uses = new AtomicInteger();

    public String id() {
        return id;
    }

    public int nextUseCount() {
        return uses.incrementAndGet();
    }
}
