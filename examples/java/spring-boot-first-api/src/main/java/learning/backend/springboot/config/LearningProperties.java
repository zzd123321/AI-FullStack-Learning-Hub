package learning.backend.springboot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("learning")
public record LearningProperties(String catalogTitle, String welcomeMessage) {

    public LearningProperties {
        catalogTitle = requireText(catalogTitle, "learning.catalog-title");
        welcomeMessage = requireText(welcomeMessage, "learning.welcome-message");
    }

    private static String requireText(String value, String propertyName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(propertyName + " 不能为空");
        }
        return value.strip();
    }
}
