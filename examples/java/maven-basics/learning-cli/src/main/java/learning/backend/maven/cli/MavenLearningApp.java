package learning.backend.maven.cli;

import learning.backend.maven.Course;
import learning.backend.maven.CourseCatalog;

public final class MavenLearningApp {
    private MavenLearningApp() {
    }

    public static void main(String[] args) {
        Course course = CourseCatalog.loadDefault();
        System.out.println("课程：" + course.title());
        System.out.println("主题：" + course.topics());
        System.out.println("模块：learning-core -> learning-cli");
    }
}
