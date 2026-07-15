package learning.backend.cache.config;

import java.time.Duration;
import java.util.Map;

import learning.backend.cache.catalog.CourseCaches;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;

@Configuration(proxyBeanMethods = false)
@Profile("redis")
public class DistributedCacheConfiguration {

    @Bean
    CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration courseCache = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(10))
                .disableCachingNullValues()
                .computePrefixWith(name -> "learning:v1:" + name + "::");

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(courseCache)
                .withInitialCacheConfigurations(Map.of(CourseCaches.BY_ID, courseCache))
                .build();
    }
}
