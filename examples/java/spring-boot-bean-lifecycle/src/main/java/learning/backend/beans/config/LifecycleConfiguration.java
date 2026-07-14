package learning.backend.beans.config;

import learning.backend.beans.lifecycle.LifecycleEventLog;
import learning.backend.beans.lifecycle.ManagedResource;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class LifecycleConfiguration {

    @Bean(initMethod = "open", destroyMethod = "close")
    ManagedResource managedResource(LifecycleEventLog eventLog) {
        return new ManagedResource(eventLog);
    }
}
