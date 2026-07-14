package learning.backend.maven;

import java.util.List;
import java.util.Objects;

public record Course(String title, List<String> topics) {
    public Course {
        Objects.requireNonNull(title, "title");
        topics = List.copyOf(topics);
    }
}
