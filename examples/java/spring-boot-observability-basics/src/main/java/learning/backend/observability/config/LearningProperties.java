package learning.backend.observability.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("learning")
public record LearningProperties(String environmentLabel, String greeting) {
}
