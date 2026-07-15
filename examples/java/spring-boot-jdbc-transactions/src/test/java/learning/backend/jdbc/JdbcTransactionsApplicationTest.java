package learning.backend.jdbc;

import javax.sql.DataSource;

import com.zaxxer.hikari.HikariDataSource;
import learning.backend.jdbc.account.LearningAccountRepository;
import learning.backend.jdbc.enrollment.CreditLedgerRepository;
import learning.backend.jdbc.enrollment.DuplicateEnrollmentException;
import learning.backend.jdbc.enrollment.EnrollmentRepository;
import learning.backend.jdbc.enrollment.EnrollmentRequest;
import learning.backend.jdbc.enrollment.EnrollmentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class JdbcTransactionsApplicationTest {

    private static final long ACCOUNT_ID = 1001L;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EnrollmentService enrollmentService;

    @Autowired
    private LearningAccountRepository accountRepository;

    @Autowired
    private EnrollmentRepository enrollmentRepository;

    @Autowired
    private CreditLedgerRepository ledgerRepository;

    @BeforeEach
    void resetBusinessData() {
        jdbcClient.sql("DELETE FROM credit_ledger").update();
        jdbcClient.sql("DELETE FROM course_enrollment").update();
        jdbcClient.sql("UPDATE learning_account SET available_credits = 10 WHERE id = 1001").update();
    }

    @Test
    void flywayMigratesBeforeJdbcBeansAreUsedAndHikariIsConfigured() {
        assertThat(dataSource).isInstanceOf(HikariDataSource.class);
        HikariDataSource hikari = (HikariDataSource) dataSource;
        assertThat(hikari.getMaximumPoolSize()).isEqualTo(5);
        assertThat(hikari.getPoolName()).isEqualTo("learning-pool");

        Integer migrationCount = jdbcClient.sql("""
                        SELECT COUNT(*)
                        FROM "flyway_schema_history"
                        WHERE "success" = TRUE
                          AND "version" IS NOT NULL
                        """)
                .query(Integer.class)
                .single();
        assertThat(migrationCount).isEqualTo(2);
        assertThat(accountRepository.findById(ACCOUNT_ID)).isPresent();
    }

    @Test
    void successfulEnrollmentCommitsAllThreeChanges() throws Exception {
        mockMvc.perform(post("/api/accounts/{accountId}/enrollments", ACCOUNT_ID)
                        .contentType("application/json")
                        .content("""
                                {"courseCode":"SPRING-JDBC","credits":3}
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.containsString(
                        "/api/accounts/1001/enrollments/")))
                .andExpect(jsonPath("$.courseCode").value("SPRING-JDBC"))
                .andExpect(jsonPath("$.credits").value(3));

        assertThat(accountRepository.findById(ACCOUNT_ID).orElseThrow().availableCredits())
                .isEqualTo(7);
        assertThat(enrollmentRepository.findByAccountId(ACCOUNT_ID)).hasSize(1);
        assertThat(ledgerRepository.countByAccountId(ACCOUNT_ID)).isEqualTo(1);
    }

    @Test
    void uncheckedFailureRollsBackTheEarlierDebit() {
        EnrollmentRequest request = new EnrollmentRequest("ROLLBACK-DEMO", 3);

        assertThatThrownBy(() -> enrollmentService.enrollThenFailForRollbackDemo(ACCOUNT_ID, request))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("演示异常");

        assertThat(accountRepository.findById(ACCOUNT_ID).orElseThrow().availableCredits())
                .isEqualTo(10);
        assertThat(enrollmentRepository.findByAccountId(ACCOUNT_ID)).isEmpty();
        assertThat(ledgerRepository.countByAccountId(ACCOUNT_ID)).isZero();
    }

    @Test
    void duplicateConstraintFailureRollsBackTheSecondDebit() {
        EnrollmentRequest request = new EnrollmentRequest("DUPLICATE", 3);
        enrollmentService.enroll(ACCOUNT_ID, request);

        assertThatThrownBy(() -> enrollmentService.enroll(ACCOUNT_ID, request))
                .isInstanceOf(DuplicateEnrollmentException.class);

        assertThat(accountRepository.findById(ACCOUNT_ID).orElseThrow().availableCredits())
                .isEqualTo(7);
        assertThat(enrollmentRepository.findByAccountId(ACCOUNT_ID)).hasSize(1);
        assertThat(ledgerRepository.countByAccountId(ACCOUNT_ID)).isEqualTo(1);
    }

    @Test
    void insufficientCreditsReturns422WithoutPartialChanges() throws Exception {
        mockMvc.perform(post("/api/accounts/{accountId}/enrollments", ACCOUNT_ID)
                        .contentType("application/json")
                        .content("""
                                {"courseCode":"EXPENSIVE-AI","credits":20}
                                """))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("INSUFFICIENT_CREDITS"));

        assertThat(accountRepository.findById(ACCOUNT_ID).orElseThrow().availableCredits())
                .isEqualTo(10);
        assertThat(enrollmentRepository.findByAccountId(ACCOUNT_ID)).isEmpty();
    }
}
