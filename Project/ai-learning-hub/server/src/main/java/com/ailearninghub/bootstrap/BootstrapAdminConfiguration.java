package com.ailearninghub.bootstrap;

import com.ailearninghub.identity.RoleCode;
import com.ailearninghub.identity.UserEntity;
import com.ailearninghub.identity.UserRepository;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@EnableConfigurationProperties(BootstrapAdminProperties.class)
public class BootstrapAdminConfiguration {
  private static final Logger log = LoggerFactory.getLogger(BootstrapAdminConfiguration.class);

  @Bean
  ApplicationRunner bootstrapAdmin(BootstrapAdminProperties properties, UserRepository users, PasswordEncoder passwordEncoder) {
    return args -> createOrUpgradeAdmin(properties, users, passwordEncoder);
  }

  void createOrUpgradeAdmin(BootstrapAdminProperties properties, UserRepository users, PasswordEncoder passwordEncoder) {
    if (isBlank(properties.email()) && isBlank(properties.password())) return;
    if (isBlank(properties.email()) || isBlank(properties.password())) {
      throw new IllegalStateException("ADMIN_EMAIL 与 ADMIN_PASSWORD 必须同时设置");
    }

    String email = properties.email().trim().toLowerCase(Locale.ROOT);
    UserEntity user = users.findByEmail(email).orElseGet(() ->
        users.save(new UserEntity(email, passwordEncoder.encode(properties.password()), properties.displayName().trim())));
    user.grantRole(RoleCode.CONTENT_ADMIN);
    user.grantRole(RoleCode.SYSTEM_ADMIN);
    users.save(user);
    log.info("本地管理员已就绪：{}（未记录密码）", email);
  }

  private static boolean isBlank(String value) { return value == null || value.isBlank(); }
}
