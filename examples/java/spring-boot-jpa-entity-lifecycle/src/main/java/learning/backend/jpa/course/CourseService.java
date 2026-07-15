package learning.backend.jpa.course;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CourseService {

    private final CourseRepository courseRepository;
    private final InstructorRepository instructorRepository;
    private final EntityManager entityManager;

    public CourseService(
            CourseRepository courseRepository,
            InstructorRepository instructorRepository,
            EntityManager entityManager) {
        this.courseRepository = courseRepository;
        this.instructorRepository = instructorRepository;
        this.entityManager = entityManager;
    }

    @Transactional(readOnly = true)
    public List<CourseCard> findCourseCards() {
        return courseRepository.findCourseCards();
    }

    @Transactional(readOnly = true)
    public CourseDetail findDetail(UUID courseId) {
        Course course = courseRepository.findDetailById(courseId)
                .orElseThrow(() -> new CourseNotFoundException(courseId));
        return toDetail(course);
    }

    @Transactional
    public CourseDetail createCourse(CreateCourseRequest request) {
        if (courseRepository.existsByCode(request.code())) {
            throw new DuplicateCourseCodeException(request.code());
        }

        Instructor instructor = instructorRepository.findById(request.instructorId())
                .orElseThrow(() -> new InstructorNotFoundException(request.instructorId()));

        Course course = new Course(
                request.code(),
                request.title(),
                instructor,
                Instant.now());

        for (CreateLessonRequest lesson : request.lessons()) {
            course.addLesson(lesson.position(), lesson.title());
        }

        Course managedCourse = courseRepository.saveAndFlush(course);
        return toDetail(managedCourse);
    }

    @Transactional
    public CourseDetail renameCourse(UUID courseId, String newTitle) {
        Course course = courseRepository.findDetailById(courseId)
                .orElseThrow(() -> new CourseNotFoundException(courseId));

        course.rename(newTitle);
        entityManager.flush();
        return toDetail(course);
    }

    @Transactional
    public void removeLesson(UUID courseId, UUID lessonId) {
        Course course = courseRepository.findDetailById(courseId)
                .orElseThrow(() -> new CourseNotFoundException(courseId));

        if (!course.removeLesson(lessonId)) {
            throw new LessonNotFoundException(lessonId);
        }
        entityManager.flush();
    }

    private static CourseDetail toDetail(Course course) {
        List<LessonView> lessons = course.lessons().stream()
                .map(lesson -> new LessonView(lesson.id(), lesson.position(), lesson.title()))
                .toList();

        return new CourseDetail(
                course.id(),
                course.version(),
                course.code(),
                course.title(),
                course.instructor().id(),
                course.instructor().displayName(),
                course.createdAt(),
                lessons);
    }
}
