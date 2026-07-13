package learning.backend.progress;

import java.io.Serial;

public final class ProgressFileException extends Exception {
    @Serial
    private static final long serialVersionUID = 1L;

    public ProgressFileException(String message) {
        super(message);
    }

    public ProgressFileException(String message, Throwable cause) {
        super(message, cause);
    }
}
