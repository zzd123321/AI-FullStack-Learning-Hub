package learning.backend.catalog;

public final class CourseCatalogApp {
    private CourseCatalogApp() {
    }

    public static void main(String[] args) {
        if (args.length != 3) {
            printUsage();
            System.exit(2);
            return;
        }

        try {
            CourseSummary course = new CourseSummary(
                    new CourseId(args[0]),
                    args[1],
                    CourseLevel.fromInput(args[2])
            );
            CourseSummary sameValue = new CourseSummary(
                    new CourseId(args[0]),
                    args[1],
                    CourseLevel.fromInput(args[2])
            );

            System.out.printf("课程 ID：%s%n", course.id().value());
            System.out.printf("课程标题：%s%n", course.title());
            System.out.printf("课程级别：%s%n", course.level().displayName());
            System.out.printf("建议时长：%d 分钟%n", course.recommendedMinutes());
            System.out.printf("相同值对象：%s%n", course.equals(sameValue));
            System.out.println("记录内容：" + course);
        } catch (IllegalArgumentException error) {
            System.err.println("错误：" + error.getMessage());
            printUsage();
            System.exit(2);
        }
    }

    private static void printUsage() {
        System.err.println("用法：java learning.backend.catalog.CourseCatalogApp <ID> <标题> <级别>");
        System.err.println("级别：basic | intermediate | advanced");
    }
}
