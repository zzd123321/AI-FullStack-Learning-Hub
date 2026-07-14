package learning.backend.beans.lifecycle;

import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;

@Component
public class AllSingletonsReady implements SmartInitializingSingleton {

    private final LifecycleEventLog eventLog;

    public AllSingletonsReady(LifecycleEventLog eventLog) {
        this.eventLog = eventLog;
    }

    @Override
    public void afterSingletonsInstantiated() {
        eventLog.add("container: all non-lazy singletons instantiated");
    }
}
