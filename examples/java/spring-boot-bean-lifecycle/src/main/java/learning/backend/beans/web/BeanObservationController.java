package learning.backend.beans.web;

import java.util.List;
import java.util.Map;

import learning.backend.beans.lifecycle.LifecycleEventLog;
import learning.backend.beans.lifecycle.ManagedResource;
import learning.backend.beans.scope.PrototypeToken;
import learning.backend.beans.scope.RequestTrace;
import learning.backend.beans.scope.SingletonMarker;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/beans")
public class BeanObservationController {

    private final LifecycleEventLog eventLog;
    private final ManagedResource managedResource;
    private final SingletonMarker singletonMarker;
    private final ObjectProvider<PrototypeToken> prototypeTokens;
    private final RequestTrace requestTrace;

    public BeanObservationController(
            LifecycleEventLog eventLog,
            ManagedResource managedResource,
            SingletonMarker singletonMarker,
            ObjectProvider<PrototypeToken> prototypeTokens,
            RequestTrace requestTrace) {
        this.eventLog = eventLog;
        this.managedResource = managedResource;
        this.singletonMarker = singletonMarker;
        this.prototypeTokens = prototypeTokens;
        this.requestTrace = requestTrace;
    }

    @GetMapping("/lifecycle")
    public Map<String, Object> lifecycle() {
        List<String> events = eventLog.snapshot();
        return Map.of("resourceState", managedResource.state(), "events", events);
    }

    @GetMapping("/singleton")
    public Map<String, String> singleton() {
        return Map.of("firstLookup", singletonMarker.id(), "secondLookup", singletonMarker.id());
    }

    @GetMapping("/prototype")
    public Map<String, String> prototype() {
        // ObjectProvider 每次 getObject 都向容器请求一个新 prototype 实例。
        return Map.of("firstLookup", prototypeTokens.getObject().id(), "secondLookup", prototypeTokens.getObject().id());
    }

    @GetMapping("/request")
    public Map<String, Object> request() {
        // 字段实际持有 scoped proxy；代理在每次请求中定位当前 request-scope 对象。
        return Map.of(
                "requestId", requestTrace.id(),
                "firstUse", requestTrace.nextUseCount(),
                "secondUse", requestTrace.nextUseCount(),
                "injectedType", requestTrace.getClass().getName());
    }
}
