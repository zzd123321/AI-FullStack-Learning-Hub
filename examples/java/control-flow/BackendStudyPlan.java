public final class BackendStudyPlan {
    // 这些值在整个程序运行期间不会改变。集中命名后，业务规则不再散落成“神秘数字”。
    private static final int WEEKDAY_TARGET_MINUTES = 45;
    private static final int WEEKEND_TARGET_MINUTES = 90;
    private static final int MAX_DAILY_MINUTES = 600;
    private static final int PROGRESS_BAR_SIZE = 10;

    private BackendStudyPlan() {
    }

    public static void main(String[] args) {
        // 第一道边界：先检查参数数量，再读取 args[0] 和 args[1]，避免数组越界。
        if (args.length != 2) {
            System.err.println("用法：java BackendStudyPlan <星期> <已学习分钟数>");
            System.err.println("示例：java BackendStudyPlan 周六 75");
            System.exit(2);
            return;
        }

        String day = args[0].trim();
        int completedMinutes;

        try {
            // 命令行传入的永远是字符串；业务计算前必须显式解析成 int。
            completedMinutes = Integer.parseInt(args[1]);
        } catch (NumberFormatException error) {
            System.err.println("错误：已学习分钟数必须是整数。");
            System.exit(2);
            return;
        }

        // switch 表达式根据星期“产生”一个目标值，而不仅仅是跳转到一段语句。
        int targetMinutes = switch (day) {
            case "周一", "周二", "周三", "周四", "周五" -> WEEKDAY_TARGET_MINUTES;
            case "周六", "周日" -> WEEKEND_TARGET_MINUTES;
            default -> -1;
        };

        if (targetMinutes == -1) {
            System.err.println("错误：星期必须是周一到周日。");
            System.exit(1);
            return;
        }

        if (completedMinutes < 0 || completedMinutes > MAX_DAILY_MINUTES) {
            System.err.printf("错误：已学习分钟数必须在 0 到 %d 之间。%n", MAX_DAILY_MINUTES);
            System.exit(1);
            return;
        }

        // 使用 100.0 让计算按 double 进行，避免整数除法丢失小数部分。
        double completionRate = completedMinutes * 100.0 / targetMinutes;
        int filledSlots = Math.min(
                PROGRESS_BAR_SIZE,
                completedMinutes * PROGRESS_BAR_SIZE / targetMinutes
        );

        String status;
        if (completedMinutes >= targetMinutes) {
            status = "今日达标";
        } else if (completionRate >= 80.0) {
            status = "接近目标";
        } else if (completedMinutes > 0) {
            status = "继续学习";
        } else {
            status = "尚未开始";
        }

        System.out.printf("学习日：%s%n", day);
        System.out.printf("目标：%d 分钟，已完成：%d 分钟%n", targetMinutes, completedMinutes);
        System.out.print("进度：[");

        // 循环执行固定次数；slot 表示当前正在绘制第几个进度格。
        for (int slot = 0; slot < PROGRESS_BAR_SIZE; slot++) {
            System.out.print(slot < filledSlots ? "#" : "-");
        }

        System.out.printf("] %.1f%%%n", completionRate);
        System.out.printf("状态：%s%n", status);
    }
}
