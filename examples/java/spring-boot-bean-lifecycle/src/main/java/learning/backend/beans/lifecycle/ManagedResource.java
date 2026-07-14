package learning.backend.beans.lifecycle;

public class ManagedResource {

    private final LifecycleEventLog eventLog;

    public ManagedResource(LifecycleEventLog eventLog) {
        this.eventLog = eventLog;
        eventLog.add("managed resource: constructor");
    }

    public void open() {
        eventLog.add("managed resource: initMethod open");
    }

    public void close() {
        eventLog.add("managed resource: destroyMethod close");
    }

    public String state() {
        return "opened by Java @Bean configuration";
    }
}
