package learning.backend.runtime;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class ProductionRuntimeApplication {
    public static void main(String[] args) {
        SpringApplication.run(ProductionRuntimeApplication.class, args);
    }
}
