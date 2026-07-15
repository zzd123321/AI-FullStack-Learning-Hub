package learning.backend.jpa.course;

public class DuplicateCourseCodeException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public DuplicateCourseCodeException(String code) {
        super("课程编号已存在：" + code);
    }
}
