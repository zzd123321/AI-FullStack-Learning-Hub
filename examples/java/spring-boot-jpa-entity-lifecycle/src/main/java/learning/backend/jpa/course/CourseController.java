package learning.backend.jpa.course;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/courses")
public class CourseController {

    private final CourseService courseService;

    public CourseController(CourseService courseService) {
        this.courseService = courseService;
    }

    @GetMapping
    public List<CourseCard> findCards() {
        return courseService.findCourseCards();
    }

    @GetMapping("/{courseId}")
    public CourseDetail findDetail(@PathVariable UUID courseId) {
        return courseService.findDetail(courseId);
    }

    @PostMapping
    public ResponseEntity<CourseDetail> create(@Valid @RequestBody CreateCourseRequest request) {
        CourseDetail detail = courseService.createCourse(request);
        return ResponseEntity.created(URI.create("/api/courses/" + detail.id())).body(detail);
    }

    @PatchMapping("/{courseId}/title")
    public CourseDetail rename(
            @PathVariable UUID courseId,
            @Valid @RequestBody RenameCourseRequest request) {
        return courseService.renameCourse(courseId, request.title());
    }

    @DeleteMapping("/{courseId}/lessons/{lessonId}")
    public ResponseEntity<Void> removeLesson(
            @PathVariable UUID courseId,
            @PathVariable UUID lessonId) {
        courseService.removeLesson(courseId, lessonId);
        return ResponseEntity.noContent().build();
    }
}
