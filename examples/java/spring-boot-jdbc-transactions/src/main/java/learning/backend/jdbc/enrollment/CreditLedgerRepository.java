package learning.backend.jdbc.enrollment;

import java.time.LocalDateTime;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class CreditLedgerRepository {

    private final JdbcClient jdbcClient;

    public CreditLedgerRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public void recordDebit(
            String ledgerId,
            long accountId,
            int credits,
            String courseCode,
            LocalDateTime createdAt) {
        jdbcClient.sql("""
                        INSERT INTO credit_ledger
                            (id, account_id, credit_delta, reason, created_at)
                        VALUES
                            (:id, :accountId, :creditDelta, :reason, :createdAt)
                        """)
                .param("id", ledgerId)
                .param("accountId", accountId)
                .param("creditDelta", -credits)
                .param("reason", "ENROLL:" + courseCode)
                .param("createdAt", createdAt)
                .update();
    }

    public int countByAccountId(long accountId) {
        return jdbcClient.sql("""
                        SELECT COUNT(*)
                        FROM credit_ledger
                        WHERE account_id = :accountId
                        """)
                .param("accountId", accountId)
                .query(Integer.class)
                .single();
    }
}
