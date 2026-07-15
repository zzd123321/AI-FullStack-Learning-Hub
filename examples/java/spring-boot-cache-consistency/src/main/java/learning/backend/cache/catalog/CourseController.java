package learning.backend.cache.catalog;

import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.cache.CacheManager;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog/courses")
public class CourseController {

    private final CourseQueryService queries;
    private final CourseCommandService commands;
    private final CourseLoader loader;
    private final CacheManager cacheManager;

    public CourseController(
            CourseQueryService queries,
            CourseCommandService commands,
            CourseLoader loader,
            CacheManager cacheManager) {
        this.queries = queries;
        this.commands = commands;
        this.loader = loader;
        this.cacheManager = cacheManager;
    }

    @GetMapping("/{id}")
    public CourseView findById(@PathVariable UUID id) {
        return queries.findById(id);
    }

    @PutMapping("/{id}")
    public CourseView update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateCourseRequest request) {
        return commands.update(id, request);
    }

    @GetMapping("/cache-diagnostics")
    public CacheDiagnostics diagnostics() {
        return new CacheDiagnostics(
                cacheManager.getClass().getSimpleName(),
                loader.databaseLoadCount());
    }
}
