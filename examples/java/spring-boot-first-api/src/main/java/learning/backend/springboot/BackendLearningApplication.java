package learning.backend.springboot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class BackendLearningApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendLearningApplication.class, args);
    }
}
