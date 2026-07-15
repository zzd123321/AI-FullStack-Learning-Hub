package learning.backend.messaging;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MessagingOutboxApplication {

    public static void main(String[] args) {
        SpringApplication.run(MessagingOutboxApplication.class, args);
    }
}
