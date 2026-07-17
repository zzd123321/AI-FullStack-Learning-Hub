public final class LearningAccountDemo {
    private LearningAccountDemo() {
    }

    public static void main(String[] args) {
        if (args.length < 2) {
            printUsage();
            System.exit(2);
            return;
        }

        try {
            // Demo 负责把外部字符串转换为构造对象所需的值。
            String learnerName = args[0];
            int dailyTargetMinutes = parseInteger(args[1], "每日目标分钟数");
            // new 会执行构造方法；若参数非法，异常会直接进入下面的 catch。
            LearningAccount account = new LearningAccount(learnerName, dailyTargetMinutes);

            for (int index = 2; index < args.length; index++) {
                // 每次循环都通过公开行为修改对象，不直接接触内部字段。
                int sessionMinutes = parseInteger(
                        args[index],
                        "第 " + (index - 1) + " 次学习分钟数"
                );
                account.recordStudySession(sessionMinutes);
            }

            printAccount(account);
        } catch (IllegalArgumentException | IllegalStateException error) {
            System.err.println("错误：" + error.getMessage());
            printUsage();
            System.exit(2);
        }
    }

    private static int parseInteger(String value, String fieldName) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(fieldName + "必须是整数：" + value, error);
        }
    }

    private static void printAccount(LearningAccount account) {
        System.out.printf("学习者：%s%n", account.getLearnerName());
        System.out.printf("每日目标：%d 分钟%n", account.getDailyTargetMinutes());
        System.out.printf("已完成：%d 分钟%n", account.getCompletedMinutes());
        System.out.printf("剩余：%d 分钟%n", account.getRemainingMinutes());
        System.out.printf("完成率：%.1f%%%n", account.getCompletionRate());
        System.out.printf("是否达标：%s%n", account.hasReachedTarget() ? "是" : "否");
        System.out.println("对象状态：" + account);
    }

    private static void printUsage() {
        System.err.println(
                "用法：java LearningAccountDemo <姓名> <每日目标分钟数> [学习分钟数] ..."
        );
        System.err.println("示例：java LearningAccountDemo 小朱 90 30 45 20");
    }
}
