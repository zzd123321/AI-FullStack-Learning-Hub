package learning.backend.jpaquery;

import learning.backend.jpaquery.catalog.CatalogCourseRepository;
import learning.backend.jpaquery.catalog.CourseStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest
class PostgreSqlCatalogIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:17-alpine");

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private CatalogCourseRepository courseRepository;

    @Test
    void flywayAndJpaQueriesRunAgainstRealPostgresql() {
        String databaseVersion = jdbcClient.sql("SELECT version()")
                .query(String.class)
                .single();

        assertThat(databaseVersion).startsWith("PostgreSQL 17");
        assertThat(courseRepository.count()).isEqualTo(12);
        assertThat(courseRepository.findPageByStatus(
                        CourseStatus.PUBLISHED,
                        org.springframework.data.domain.PageRequest.of(0, 3)))
                .hasSize(3);
    }
}
