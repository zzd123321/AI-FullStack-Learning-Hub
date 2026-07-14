package learning.backend.maven;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Properties;

public final class CourseCatalog {
    private CourseCatalog() {
    }

    public static Course loadDefault() {
        Properties properties = new Properties();
        try (InputStream input = CourseCatalog.class
                .getResourceAsStream("/learning.properties")) {
            if (input == null) {
                throw new IllegalStateException("缺少 learning.properties");
            }
            properties.load(new InputStreamReader(input, StandardCharsets.UTF_8));
        } catch (IOException error) {
            throw new IllegalStateException("读取课程配置失败", error);
        }

        String title = requireProperty(properties, "course.title");
        List<String> topics = Arrays.stream(
                        requireProperty(properties, "course.topics").split(",")
                )
                .map(String::trim)
                .filter(topic -> !topic.isEmpty())
                .toList();
        return new Course(title, topics);
    }

    private static String requireProperty(
            Properties properties,
            String name
    ) {
        String value = properties.getProperty(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("缺少配置：" + name);
        }
        return value;
    }
}
