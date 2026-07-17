public final class StudyStatistics {
    private static final int MAX_DAILY_MINUTES = 1_440;

    private StudyStatistics() {
    }

    public static void main(String[] args) {
        try {
            // main 只负责编排步骤：先把外部字符串变成可信数据，再生成报告。
            int[] dailyMinutes = parseDailyMinutes(args);
            printReport(dailyMinutes);
        } catch (IllegalArgumentException error) {
            // 所有可预期的输入错误在程序边界统一转换成用户能看懂的信息。
            System.err.println("错误：" + error.getMessage());
            System.err.println("用法：java StudyStatistics <第1天分钟数> [第2天分钟数] ...");
            System.exit(2);
        }
    }

    private static int[] parseDailyMinutes(String[] arguments) {
        if (arguments.length == 0) {
            throw new IllegalArgumentException("至少提供一天的学习分钟数。");
        }

        // 数组创建后长度固定；每个位置稍后保存对应参数解析出的 int。
        int[] minutes = new int[arguments.length];

        for (int index = 0; index < arguments.length; index++) {
            int value;

            try {
                value = Integer.parseInt(arguments[index]);
            } catch (NumberFormatException error) {
                // 保留原始异常作为 cause，排查时不会丢失真正失败的位置。
                throw new IllegalArgumentException(
                        "第 " + (index + 1) + " 个分钟数必须是整数：" + arguments[index],
                        error
                );
            }

            if (value < 0 || value > MAX_DAILY_MINUTES) {
                throw new IllegalArgumentException(
                        "第 " + (index + 1) + " 个分钟数必须在 0 到 "
                                + MAX_DAILY_MINUTES + " 之间。"
                );
            }

            minutes[index] = value;
        }

        return minutes;
    }

    private static void printReport(int[] dailyMinutes) {
        // 每个方法只完成一种计算。中间结果使用清晰名称连接成一条数据流。
        int totalMinutes = sum(dailyMinutes);
        double averageMinutes = average(totalMinutes, dailyMinutes.length);
        int longestDayMinutes = max(dailyMinutes);
        int activeDays = countPositiveValues(dailyMinutes);

        System.out.printf("记录天数：%d%n", dailyMinutes.length);
        System.out.printf("学习总时长：%d 分钟%n", totalMinutes);
        System.out.printf("日均时长：%.1f 分钟%n", averageMinutes);
        System.out.printf("最长一天：%d 分钟%n", longestDayMinutes);
        System.out.printf("有效学习天数：%d%n", activeDays);
    }

    private static int sum(int[] values) {
        int result = 0;

        // 增强 for 循环依次把数组元素复制给 value；它不提供当前下标。
        for (int value : values) {
            result += value;
        }

        return result;
    }

    private static double average(int total, int count) {
        if (count == 0) {
            throw new IllegalArgumentException("计算平均值时，数据不能为空。");
        }

        // 强制把 total 转成 double，否则两个 int 相除会先丢掉小数部分。
        return (double) total / count;
    }

    private static int max(int... values) {
        // 调用方看见的是可变参数，方法内部接收到的仍然是 int[] 数组。
        if (values.length == 0) {
            throw new IllegalArgumentException("计算最大值时，数据不能为空。");
        }

        int result = values[0];

        for (int index = 1; index < values.length; index++) {
            if (values[index] > result) {
                result = values[index];
            }
        }

        return result;
    }

    private static int countPositiveValues(int[] values) {
        int count = 0;

        for (int value : values) {
            if (value > 0) {
                count++;
            }
        }

        return count;
    }
}
