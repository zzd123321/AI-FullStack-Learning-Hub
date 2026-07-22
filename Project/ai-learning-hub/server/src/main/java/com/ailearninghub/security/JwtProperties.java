package com.ailearninghub.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "security.jwt")
public record JwtProperties(
    String secret,
    long accessTokenMinutes,
    long refreshTokenDays,
    boolean secureCookie) {}
