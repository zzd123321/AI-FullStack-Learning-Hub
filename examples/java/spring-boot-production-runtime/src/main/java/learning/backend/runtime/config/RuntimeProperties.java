package learning.backend.runtime.config;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.runtime")
public record RuntimeProperties(String instanceName, URI publicBaseUrl) {
    public RuntimeProperties {
        if (instanceName == null || instanceName.isBlank()) {
            throw new IllegalArgumentException("app.runtime.instance-name 不能为空。");
        }
        if (publicBaseUrl == null || !publicBaseUrl.isAbsolute()) {
            throw new IllegalArgumentException("app.runtime.public-base-url 必须是绝对 URI。");
        }
        instanceName = instanceName.strip();
    }
}
