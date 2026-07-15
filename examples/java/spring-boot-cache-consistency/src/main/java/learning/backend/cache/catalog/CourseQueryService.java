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
        return loader.load(id);
    }
}
