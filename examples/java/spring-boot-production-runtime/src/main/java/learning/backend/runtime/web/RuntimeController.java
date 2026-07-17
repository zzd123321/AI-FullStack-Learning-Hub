package learning.backend.runtime.web;

import learning.backend.runtime.config.RuntimeProperties;
import learning.backend.runtime.lifecycle.ManagedWorker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime")
public class RuntimeController {
    private final RuntimeProperties properties;
    private final ApplicationAvailability availability;
    private final ManagedWorker worker;
    private final String applicationName;

    public RuntimeController(
            RuntimeProperties properties,
            ApplicationAvailability availability,
            ManagedWorker worker,
            @Value("${spring.application.name}") String applicationName
    ) {
        this.properties = properties;
        this.availability = availability;
        this.worker = worker;
        this.applicationName = applicationName;
    }

    @GetMapping
    public RuntimeView runtime() {
        // 只返回允许公开的运行信息；秘密配置绝不能放进诊断响应。
        return new RuntimeView(
                applicationName,
                properties.instanceName(),
                properties.publicBaseUrl().toString(),
                availability.getLivenessState().toString(),
                availability.getReadinessState().toString(),
                worker.isRunning()
        );
    }
}
