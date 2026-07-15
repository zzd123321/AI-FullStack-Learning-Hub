package learning.backend.jdbc.account;

public class InsufficientCreditsException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public InsufficientCreditsException(long accountId, int requiredCredits) {
        super("账户 %d 的可用学分不足，课程需要 %d 学分。".formatted(accountId, requiredCredits));
    }
}
