package learning.backend.cache.catalog;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class CourseCacheInvalidator {

    private static final Logger log = LoggerFactory.getLogger(CourseCacheInvalidator.class);

    private final CacheManager cacheManager;

    public CourseCacheInvalidator(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void evictAfterCommit(CourseChangedEvent event) {
        Cache cache = cacheManager.getCache(CourseCaches.BY_ID);
        if (cache == null) {
            log.error("缓存 {} 未配置，无法失效课程 {}", CourseCaches.BY_ID, event.courseId());
            return;
        }
        try {
            cache.evictIfPresent(event.courseId());
        } catch (RuntimeException exception) {
            log.error("数据库已提交，但课程缓存失效失败: {}", event.courseId(), exception);
        }
    }
}
