package learning.backend.springboot.course;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.stereotype.Service;

@Service
public class CourseService {

    private final ConcurrentMap<String, Course> courses = new ConcurrentHashMap<>();

    public CourseService() {
        saveInitial(new Course(
                "spring-boot",
                "Spring Boot 基础",
                List.of("项目结构", "自动配置", "HTTP API")));
        saveInitial(new Course(
                "maven",
                "Maven 基础",
                List.of("POM", "依赖管理", "生命周期")));
    }

    public List<Course> findAll() {
        return courses.values().stream()
                .sorted(Comparator.comparing(Course::slug))
                .toList();
    }

    public Course findBySlug(String slug) {
        Course course = courses.get(normalizeSlug(slug));
        if (course == null) {
            throw new CourseNotFoundException(slug);
        }
        return course;
    }

    public Course create(CreateCourseRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }

        Course course = request.toCourse();
        Course previous = courses.putIfAbsent(course.slug(), course);
        if (previous != null) {
            throw new CourseAlreadyExistsException(course.slug());
        }
        return course;
    }

    private void saveInitial(Course course) {
        courses.put(course.slug(), course);
    }

    private static String normalizeSlug(String slug) {
        if (slug == null || slug.isBlank()) {
            throw new IllegalArgumentException("slug 不能为空");
        }
        return slug.strip().toLowerCase(Locale.ROOT);
    }
}
