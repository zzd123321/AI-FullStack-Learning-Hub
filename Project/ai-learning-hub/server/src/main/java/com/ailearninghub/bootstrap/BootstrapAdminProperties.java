package com.ailearninghub.bootstrap;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "bootstrap.admin")
public record BootstrapAdminProperties(String email, String password, String displayName) {}
