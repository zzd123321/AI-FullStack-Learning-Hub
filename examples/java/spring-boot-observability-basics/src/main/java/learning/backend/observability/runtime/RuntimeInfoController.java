package learning.backend.observability.runtime;

import java.util.Arrays;
import java.util.List;

import learning.backend.observability.config.LearningProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime")
public class RuntimeInfoController {

    private static final Logger logger = LoggerFactory.getLogger(RuntimeInfoController.class);

    private final String applicationName;
    private final LearningProperties properties;
    private final Environment environment;
    private final RuntimeMetrics metrics;

    public RuntimeInfoController(
            @Value("${spring.application.name}") String applicationName,
            LearningProperties properties,
            Environment environment,
            RuntimeMetrics metrics) {
        this.applicationName = applicationName;
        this.properties = properties;
        this.environment = environment;
        this.metrics = metrics;
    }

    @GetMapping
    public RuntimeInfo runtimeInfo() {
        List<String> activeProfiles = Arrays.asList(environment.getActiveProfiles());
        metrics.recordRequest();

        logger.atInfo()
                .addKeyValue("environment", properties.environmentLabel())
                .addKeyValue("activeProfiles", activeProfiles)
                .log("Runtime information requested");

        logger.debug("Resolved greeting length: {}", properties.greeting().length());

        return new RuntimeInfo(
                applicationName,
                properties.environmentLabel(),
                properties.greeting(),
                activeProfiles);
    }
}
