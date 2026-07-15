package learning.backend.jdbc.account;

public class AccountNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public AccountNotFoundException(long accountId) {
        super("学习账户不存在：" + accountId);
    }
}
