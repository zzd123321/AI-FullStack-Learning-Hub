package learning.backend.jpa.course;

public class InstructorNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public InstructorNotFoundException(long instructorId) {
        super("讲师不存在：" + instructorId);
    }
}
