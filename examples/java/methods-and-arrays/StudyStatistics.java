public final class StudyStatistics {
    private static final int MAX_DAILY_MINUTES = 1_440;

    private StudyStatistics() {
    }

    public static void main(String[] args) {
        try {
            int[] dailyMinutes = parseDailyMinutes(args);
            printReport(dailyMinutes);
        } catch (IllegalArgumentException error) {
            System.err.println("错误：" + error.getMessage());
            System.err.println("用法：java StudyStatistics <第1天分钟数> [第2天分钟数] ...");
            System.exit(2);
        }
    }

    private static int[] parseDailyMinutes(String[] arguments) {
        if (arguments.length == 0) {
            throw new IllegalArgumentException("至少提供一天的学习分钟数。");
        }

        int[] minutes = new int[arguments.length];

        for (int index = 0; index < arguments.length; index++) {
            int value;

            try {
                value = Integer.parseInt(arguments[index]);
            } catch (NumberFormatException error) {
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

        for (int value : values) {
            result += value;
        }

        return result;
    }

    private static double average(int total, int count) {
        if (count == 0) {
            throw new IllegalArgumentException("计算平均值时，数据不能为空。");
        }

        return (double) total / count;
    }

    private static int max(int... values) {
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
