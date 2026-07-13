package learning.backend.jvm;

import java.util.List;

public final class JvmRuntimeApp {
    private JvmRuntimeApp() {
    }

    public static void main(String[] args) {
        System.out.println("程序开始");
        System.out.println("编译期常量：" + RuntimeFeature.COMPILE_TIME_NAME);
        System.out.println("准备访问运行期静态值");
        System.out.println("运行期 JDK 特性版本：" + RuntimeFeature.featureVersion());

        LearningPlan plan = new LearningPlan(
                "JVM 基础",
                List.of("class 文件", "JIT", "垃圾回收")
        );
        System.out.println(summarize(plan));
        System.out.println("应用类加载器存在："
                + (JvmRuntimeApp.class.getClassLoader() != null));
        System.out.println("String 由引导加载器加载："
                + (String.class.getClassLoader() == null));
    }

    private static String summarize(LearningPlan plan) {
        int topicCount = plan.topics().size();
        return "学习计划：" + plan.title() + "，主题数：" + topicCount;
    }
}
