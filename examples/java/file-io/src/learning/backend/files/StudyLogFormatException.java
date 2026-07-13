package learning.backend.files;

import java.io.Serial;

public final class StudyLogFormatException extends Exception {
    @Serial
    private static final long serialVersionUID = 1L;

    public StudyLogFormatException(String message) {
        super(message);
    }

    public StudyLogFormatException(String message, Throwable cause) {
        super(message, cause);
    }
}
