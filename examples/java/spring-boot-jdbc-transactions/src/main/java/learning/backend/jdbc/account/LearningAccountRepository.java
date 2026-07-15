package learning.backend.jdbc.account;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class LearningAccountRepository {

    private final JdbcClient jdbcClient;

    public LearningAccountRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public Optional<LearningAccount> findById(long accountId) {
        return jdbcClient.sql("""
                        SELECT id, learner_name, available_credits
                        FROM learning_account
                        WHERE id = :accountId
                        """)
                .param("accountId", accountId)
                .query((resultSet, rowNumber) -> new LearningAccount(
                        resultSet.getLong("id"),
                        resultSet.getString("learner_name"),
                        resultSet.getInt("available_credits")))
                .optional();
    }

    public boolean debitCreditsIfAvailable(long accountId, int credits) {
        int changedRows = jdbcClient.sql("""
                        UPDATE learning_account
                        SET available_credits = available_credits - :credits
                        WHERE id = :accountId
                          AND available_credits >= :credits
                        """)
                .param("credits", credits)
                .param("accountId", accountId)
                .update();
        return changedRows == 1;
    }
}
