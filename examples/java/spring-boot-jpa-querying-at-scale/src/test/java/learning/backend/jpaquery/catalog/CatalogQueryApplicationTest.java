package learning.backend.jpaquery.catalog;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class CatalogQueryApplicationTest {

    @Autowired
    private CatalogQueryService queryService;

    @Autowired
    private CatalogBatchService batchService;

    @Autowired
    private CatalogCourseRepository courseRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private MockMvc mockMvc;

    private Statistics statistics;

    @BeforeEach
    void resetDataAndStatistics() {
        jdbcClient.sql("DELETE FROM catalog_course WHERE code LIKE 'TEST-%'").update();
        jdbcClient.sql("""
                UPDATE catalog_course
                SET status = 'DRAFT', version = 0
                WHERE code IN ('SECURITY-DRAFT', 'MLOPS-DRAFT')
                """).update();

        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
    }

    @Test
    void specificationComposesOnlyFiltersThatWereProvided() {
        CoursePageResponse response = queryService.search(
                new CourseSearchCriteria(
                        "spring",
                        CourseCategory.BACKEND,
                        CourseStatus.PUBLISHED,
                        14_000),
                0,
                10,
                "publishedAt",
                Sort.Direction.DESC);

        assertThat(response.totalElements()).isEqualTo(2);
        assertThat(response.content())
                .extracting(CourseSummary::code)
                .containsExactly("SPRING-MVC", "SPRING-JPA");
    }

    @Test
    void pageRunsCountQueryButSliceOnlyChecksForOneMoreRow() {
        statistics.clear();
        assertThat(queryService.findPublishedPage(0, 3).getTotalElements()).isEqualTo(9);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);

        statistics.clear();
        assertThat(queryService.findPublishedSlice(0, 3).hasNext()).isTrue();
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }

    @Test
    void keysetWindowResumesAfterLastSeenSortKeysWithoutDuplicates() {
        CourseWindowResponse first = queryService.scrollPublished(null, null);
        CourseWindowResponse second =
                queryService.scrollPublished(first.nextPublishedAt(), first.nextId());

        assertThat(first.content()).hasSize(3);
        assertThat(first.hasNext()).isTrue();
        assertThat(second.content()).hasSize(3);

        Set<String> codes = new HashSet<>();
        first.content().forEach(course -> codes.add(course.code()));
        second.content().forEach(course -> codes.add(course.code()));
        assertThat(codes).hasSize(6);
        assertThat(second.content().get(0).publishedAt())
                .isBefore(first.content().get(2).publishedAt());
    }

    @Test
    void sortAllowlistRejectsInternalOrUnknownProperties() throws Exception {
        mockMvc.perform(get("/api/catalog/courses")
                        .param("sort", "version"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"));

        assertThatThrownBy(() -> queryService.search(
                new CourseSearchCriteria(null, null, null, null),
                0,
                10,
                "drop table",
                Sort.Direction.ASC))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不支持的排序字段");
    }

    @Test
    @Transactional
    void bulkUpdateFlushesAndClearsPersistenceContext() {
        CatalogCourse draft = courseRepository.findByCode("SECURITY-DRAFT").orElseThrow();
        assertThat(entityManager.contains(draft)).isTrue();

        int affected = batchService.archiveDraftsBefore(
                Instant.parse("2026-01-01T00:00:00Z"));

        assertThat(affected).isEqualTo(2);
        assertThat(entityManager.contains(draft)).isFalse();
        assertThat(courseRepository.findByCode("SECURITY-DRAFT").orElseThrow().status())
                .isEqualTo(CourseStatus.ARCHIVED);
    }

    @Test
    void chunkedInsertKeepsPersistenceContextBounded() {
        assertThat(batchService.insertGeneratedCourses("TEST-BATCH", 25)).isEqualTo(25);
        assertThat(jdbcClient.sql("""
                        SELECT COUNT(*) FROM catalog_course
                        WHERE code LIKE 'TEST-BATCH-%'
                        """)
                .query(Integer.class)
                .single()).isEqualTo(25);
    }
}
