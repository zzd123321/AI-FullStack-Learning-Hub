package learning.backend.jpa.course;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QueryPlanDemoService {

    private final CourseRepository courseRepository;

    public QueryPlanDemoService(CourseRepository courseRepository) {
        this.courseRepository = courseRepository;
    }

    @Transactional(readOnly = true)
    public List<CourseInstructorView> loadWithNPlusOne() {
        return courseRepository.findAllByOrderByCodeAsc().stream()
                .map(QueryPlanDemoService::toInstructorView)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CourseInstructorView> loadWithEntityGraph() {
        return courseRepository.findAllWithInstructor().stream()
                .map(QueryPlanDemoService::toInstructorView)
                .toList();
    }

    private static CourseInstructorView toInstructorView(Course course) {
        return new CourseInstructorView(
                course.id(),
                course.code(),
                course.instructor().displayName());
    }
}
