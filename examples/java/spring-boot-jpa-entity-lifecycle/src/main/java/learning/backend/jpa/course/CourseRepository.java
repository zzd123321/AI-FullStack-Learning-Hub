package learning.backend.jpa.course;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CourseRepository extends JpaRepository<Course, UUID> {

    boolean existsByCode(String code);

    List<Course> findAllByOrderByCodeAsc();

    @EntityGraph(attributePaths = "instructor")
    @Query("SELECT c FROM Course c ORDER BY c.code")
    List<Course> findAllWithInstructor();

    @EntityGraph(attributePaths = {"instructor", "lessons"})
    @Query("SELECT c FROM Course c WHERE c.id = :courseId")
    Optional<Course> findDetailById(@Param("courseId") UUID courseId);

    @Query("""
            SELECT new learning.backend.jpa.course.CourseCard(
                c.id, c.code, c.title, i.displayName, COUNT(l)
            )
            FROM Course c
            JOIN c.instructor i
            LEFT JOIN c.lessons l
            GROUP BY c.id, c.code, c.title, i.displayName
            ORDER BY c.code
            """)
    List<CourseCard> findCourseCards();
}
