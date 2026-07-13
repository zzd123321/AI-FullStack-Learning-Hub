public final class HelloBackend {
    private HelloBackend() {
    }

    public static void main(String[] args) {
        String learner = args.length > 0 ? args[0].trim() : "前端开发者";

        if (learner.isEmpty()) {
            System.err.println("错误：学习者名称不能为空。");
            System.exit(1);
        }

        System.out.printf("你好，%s！%n", learner);
        System.out.println("Java 后端学习环境已经就绪。");
    }
}
