public final class HelloBackend {
    // 这个示例只有程序入口，不需要创建 HelloBackend 对象。
    // 私有构造方法明确阻止 `new HelloBackend()` 这种无意义操作。
    private HelloBackend() {
    }

    public static void main(String[] args) {
        // JVM 会把命令行中类名后面的内容依次放进 args 数组。
        // 没有提供名称时使用默认值；提供了名称时先去掉两端空白。
        String learner = args.length > 0 ? args[0].trim() : "前端开发者";

        // 空字符串属于可预期的无效输入，因此主动输出明确错误并返回非 0 退出码。
        if (learner.isEmpty()) {
            System.err.println("错误：学习者名称不能为空。");
            System.exit(1);
        }

        // %s 由 learner 替换，%n 使用当前操作系统对应的换行符。
        System.out.printf("你好，%s！%n", learner);
        System.out.println("Java 后端学习环境已经就绪。");
    }
}
