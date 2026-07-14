package learning.backend.springboot.course;

import java.net.URI;
import java.util.List;

import learning.backend.springboot.config.LearningProperties;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/courses")
public class CourseController {

    private final CourseService courseService;
    private final LearningProperties properties;

    public CourseController(CourseService courseService, LearningProperties properties) {
        this.courseService = courseService;
        this.properties = properties;
    }

    @GetMapping
    public CourseCatalogResponse findAll() {
        return new CourseCatalogResponse(
                properties.catalogTitle(),
                properties.welcomeMessage(),
                courseService.findAll());
    }

    @GetMapping("/{slug}")
    public Course findBySlug(@PathVariable String slug) {
        return courseService.findBySlug(slug);
    }

    @PostMapping
    public ResponseEntity<Course> create(@RequestBody CreateCourseRequest request) {
        Course created = courseService.create(request);
        URI location = URI.create("/api/courses/" + created.slug());
        return ResponseEntity.created(location).body(created);
    }

    public record CourseCatalogResponse(
            String title,
            String message,
            List<Course> courses) {
    }
}
