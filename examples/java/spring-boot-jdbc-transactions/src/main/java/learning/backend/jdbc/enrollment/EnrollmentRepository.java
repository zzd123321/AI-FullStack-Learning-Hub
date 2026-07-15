package learning.backend.jdbc.enrollment;

import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class EnrollmentRepository {

    private final JdbcClient jdbcClient;

    public EnrollmentRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public void insert(Enrollment enrollment) {
        jdbcClient.sql("""
                        INSERT INTO course_enrollment
                            (id, account_id, course_code, credits, enrolled_at)
                        VALUES
                            (:id, :accountId, :courseCode, :credits, :enrolledAt)
                        """)
                .param("id", enrollment.id())
                .param("accountId", enrollment.accountId())
                .param("courseCode", enrollment.courseCode())
                .param("credits", enrollment.credits())
                .param("enrolledAt", enrollment.enrolledAt())
                .update();
    }

    public List<Enrollment> findByAccountId(long accountId) {
        return jdbcClient.sql("""
                        SELECT id, account_id, course_code, credits, enrolled_at
                        FROM course_enrollment
                        WHERE account_id = :accountId
                        ORDER BY enrolled_at, id
                        """)
                .param("accountId", accountId)
                .query((resultSet, rowNumber) -> new Enrollment(
                        resultSet.getString("id"),
                        resultSet.getLong("account_id"),
                        resultSet.getString("course_code"),
                        resultSet.getInt("credits"),
                        resultSet.getTimestamp("enrolled_at").toLocalDateTime()))
                .list();
    }
}
