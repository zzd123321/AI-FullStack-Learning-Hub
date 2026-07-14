package learning.backend.springboot.course;

import java.util.List;

public record CreateCourseRequest(String slug, String title, List<String> topics) {

    public Course toCourse() {
        return new Course(slug, title, topics);
    }
}
