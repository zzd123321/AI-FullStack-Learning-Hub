package learning.backend.cache.catalog;

import java.util.UUID;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class CourseQueryService {

    private final CourseLoader loader;

    public CourseQueryService(CourseLoader loader) {
        this.loader = loader;
    }

    @Cacheable(cacheNames = CourseCaches.BY_ID, key = "#id", sync = true)
    public CourseView findById(UUID id) {
        // 只有 cache miss 才会经过代理执行方法体；命中时代理直接返回缓存值。
        // sync=true 只协调当前 cache provider 支持范围内的并发加载，不是分布式锁承诺。
        return loader.load(id);
    }
}
