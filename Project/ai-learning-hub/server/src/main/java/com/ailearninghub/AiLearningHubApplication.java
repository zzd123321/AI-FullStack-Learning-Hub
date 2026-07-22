package com.ailearninghub;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class AiLearningHubApplication {

  public static void main(String[] args) {
    SpringApplication.run(AiLearningHubApplication.class, args);
  }
}
