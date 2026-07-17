public final class LearningAccount {
    // 常量属于“所有学习账户共同遵守的规则”，因此使用 static；final 表示规则引用不会改变。
    private static final int MAX_DAILY_TARGET_MINUTES = 1_440;
    private static final int MAX_SESSION_MINUTES = 720;

    // 每个对象都有自己的一份实例字段。外部代码不能绕过方法直接修改它们。
    private final String learnerName;
    private final int dailyTargetMinutes;
    private int completedMinutes;

    public LearningAccount(String learnerName, int dailyTargetMinutes) {
        // 两参数构造方法把真正的初始化委托给三参数构造方法，避免复制校验逻辑。
        this(learnerName, dailyTargetMinutes, 0);
    }

    public LearningAccount(
            String learnerName,
            int dailyTargetMinutes,
            int completedMinutes
    ) {
        // 只有三个值都通过校验，调用方才能正常获得这个对象。
        this.learnerName = normalizeLearnerName(learnerName);
        this.dailyTargetMinutes = validateDailyTarget(dailyTargetMinutes);
        this.completedMinutes = validateCompletedMinutes(completedMinutes);
    }

    public String getLearnerName() {
        return learnerName;
    }

    public int getDailyTargetMinutes() {
        return dailyTargetMinutes;
    }

    public int getCompletedMinutes() {
        return completedMinutes;
    }

    public void recordStudySession(int minutes) {
        // 对象自己维护业务规则，调用方不能直接给 completedMinutes 填入非法值。
        if (minutes <= 0 || minutes > MAX_SESSION_MINUTES) {
            throw new IllegalArgumentException(
                    "单次学习分钟数必须在 1 到 " + MAX_SESSION_MINUTES + " 之间。"
            );
        }

        try {
            // addExact 在 int 溢出时抛异常，避免累计值悄悄绕回负数。
            completedMinutes = Math.addExact(completedMinutes, minutes);
        } catch (ArithmeticException error) {
            throw new IllegalStateException("累计学习分钟数超出 int 范围。", error);
        }
    }

    public int getRemainingMinutes() {
        // 即使已经超额完成，也不向调用方返回没有业务意义的负剩余时间。
        return Math.max(0, dailyTargetMinutes - completedMinutes);
    }

    public double getCompletionRate() {
        return completedMinutes * 100.0 / dailyTargetMinutes;
    }

    public boolean hasReachedTarget() {
        return completedMinutes >= dailyTargetMinutes;
    }

    @Override
    public String toString() {
        return "LearningAccount{"
                + "learnerName='" + learnerName + '\''
                + ", dailyTargetMinutes=" + dailyTargetMinutes
                + ", completedMinutes=" + completedMinutes
                + '}';
    }

    private static String normalizeLearnerName(String learnerName) {
        if (learnerName == null) {
            throw new IllegalArgumentException("学习者姓名不能为空。");
        }

        String normalized = learnerName.trim();

        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("学习者姓名不能为空白字符。");
        }

        return normalized;
    }

    private static int validateDailyTarget(int dailyTargetMinutes) {
        if (dailyTargetMinutes <= 0 || dailyTargetMinutes > MAX_DAILY_TARGET_MINUTES) {
            throw new IllegalArgumentException(
                    "每日目标分钟数必须在 1 到 " + MAX_DAILY_TARGET_MINUTES + " 之间。"
            );
        }

        return dailyTargetMinutes;
    }

    private static int validateCompletedMinutes(int completedMinutes) {
        if (completedMinutes < 0) {
            throw new IllegalArgumentException("已完成分钟数不能为负数。");
        }

        return completedMinutes;
    }
}
