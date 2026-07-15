package learning.backend.jdbc.enrollment;

public class DuplicateEnrollmentException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public DuplicateEnrollmentException(long accountId, String courseCode, Throwable cause) {
        super("账户 %d 已报名课程 %s。".formatted(accountId, courseCode), cause);
    }
}
