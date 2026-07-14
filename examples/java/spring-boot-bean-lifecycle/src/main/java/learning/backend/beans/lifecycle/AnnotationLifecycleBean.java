package learning.backend.beans.lifecycle;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import org.springframework.stereotype.Component;

@Component
public class AnnotationLifecycleBean {

    private final LifecycleEventLog eventLog;

    public AnnotationLifecycleBean(LifecycleEventLog eventLog) {
        this.eventLog = eventLog;
        eventLog.add("annotation bean: constructor");
    }

    @PostConstruct
    void prepare() {
        eventLog.add("annotation bean: @PostConstruct");
    }

    @PreDestroy
    void release() {
        eventLog.add("annotation bean: @PreDestroy");
    }
}
