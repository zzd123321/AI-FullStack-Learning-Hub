package learning.backend.beans.lifecycle;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LifecycleEventLog {

    private static final Logger logger = LoggerFactory.getLogger(LifecycleEventLog.class);

    private final List<String> events = new CopyOnWriteArrayList<>();

    public void add(String event) {
        events.add(Instant.now() + " " + event);
        logger.info("lifecycle-event: {}", event);
    }

    public List<String> snapshot() {
        return List.copyOf(events);
    }
}
