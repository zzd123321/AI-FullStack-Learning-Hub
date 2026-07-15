package learning.backend.jpa;

import java.util.List;
import java.util.UUID;

import jakarta.persistence.EntityManagerFactory;
import learning.backend.jpa.course.CourseDetail;
import learning.backend.jpa.course.CourseService;
import learning.backend.jpa.course.CreateCourseRequest;
import learning.backend.jpa.course.CreateLessonRequest;
import learning.backend.jpa.course.QueryPlanDemoService;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class JpaLifecycleApplicationTest {

    private static final UUID JPA_COURSE_ID =
            UUID.fromString("10000000-0000-0000-0000-000000000001");

    @Autowired
    private CourseService courseService;

    @Autowired
    private QueryPlanDemoService queryPlanDemoService;

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private MockMvc mockMvc;

    private Statistics statistics;

    @BeforeEach
    void resetBusinessDataAndStatistics() {
        jdbcClient.sql("""
                DELETE FROM lesson
                WHERE course_id IN (SELECT id FROM course WHERE code LIKE 'TEST-%')
                """).update();
        jdbcClient.sql("DELETE FROM course WHERE code LIKE 'TEST-%'").update();
        jdbcClient.sql("""
                UPDATE course
                SET title = 'Java 持久化与 JPA', version = 0
                WHERE id = :courseId
                """)
                .param("courseId", JPA_COURSE_ID)
                .update();

        SessionFactory sessionFactory = entityManagerFactory.unwrap(SessionFactory.class);
        statistics = sessionFactory.getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
    }

    @Test
    void flywayCreatesSchemaThatHibernateValidates() {
        Integer migrationCount = jdbcClient.sql("""
                        SELECT COUNT(*)
                        FROM "flyway_schema_history"
                        WHERE "success" = TRUE
                          AND "version" IS NOT NULL
                        """)
                .query(Integer.class)
                .single();

        assertThat(migrationCount).isEqualTo(2);
        assertThat(jdbcClient.sql("SELECT COUNT(*) FROM course").query(Integer.class).single())
                .isEqualTo(3);
    }

    @Test
    void naiveLazyTraversalProducesOnePlusNButEntityGraphUsesOneStatement() {
        assertThat(queryPlanDemoService.loadWithNPlusOne()).hasSize(3);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(4);

        statistics.clear();

        assertThat(queryPlanDemoService.loadWithEntityGraph()).hasSize(3);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }

    @Test
    void dtoProjectionBuildsCourseCardsWithoutReturningManagedEntities() throws Exception {
        statistics.clear();

        mockMvc.perform(get("/api/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].code").value("HIBERNATE-FETCH"))
                .andExpect(jsonPath("$[0].lessonCount").value(2));

        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }

    @Test
    void persistCascadesFromNewCourseToItsLessons() {
        CourseDetail created = courseService.createCourse(new CreateCourseRequest(
                "TEST-CASCADE",
                "JPA Cascade 测试",
                101L,
                List.of(
                        new CreateLessonRequest(1, "父实体持久化"),
                        new CreateLessonRequest(2, "子实体级联"))));

        assertThat(created.version()).isZero();
        assertThat(created.lessons()).hasSize(2);
        assertThat(jdbcClient.sql("SELECT COUNT(*) FROM course WHERE id = :courseId")
                .param("courseId", created.id())
                .query(Integer.class)
                .single()).isEqualTo(1);
        assertThat(jdbcClient.sql("SELECT COUNT(*) FROM lesson WHERE course_id = :courseId")
                .param("courseId", created.id())
                .query(Integer.class)
                .single()).isEqualTo(2);
    }

    @Test
    void managedEntityIsUpdatedByDirtyCheckingWithoutCallingSave() {
        CourseDetail renamed = courseService.renameCourse(JPA_COURSE_ID, "JPA 生命周期与脏检查");

        assertThat(renamed.title()).isEqualTo("JPA 生命周期与脏检查");
        assertThat(renamed.version()).isEqualTo(1);
        assertThat(jdbcClient.sql("SELECT title FROM course WHERE id = :courseId")
                .param("courseId", JPA_COURSE_ID)
                .query(String.class)
                .single()).isEqualTo("JPA 生命周期与脏检查");
    }

    @Test
    void orphanRemovalDeletesLessonRemovedFromOwnedCollection() {
        CourseDetail created = courseService.createCourse(new CreateCourseRequest(
                "TEST-ORPHAN",
                "Orphan Removal 测试",
                102L,
                List.of(
                        new CreateLessonRequest(1, "保留课时"),
                        new CreateLessonRequest(2, "删除课时"))));

        courseService.removeLesson(created.id(), created.lessons().get(1).id());

        assertThat(jdbcClient.sql("SELECT COUNT(*) FROM lesson WHERE course_id = :courseId")
                .param("courseId", created.id())
                .query(Integer.class)
                .single()).isEqualTo(1);
    }
}
