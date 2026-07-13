public final class LearningAccount {
    private static final int MAX_DAILY_TARGET_MINUTES = 1_440;
    private static final int MAX_SESSION_MINUTES = 720;

    private final String learnerName;
    private final int dailyTargetMinutes;
    private int completedMinutes;

    public LearningAccount(String learnerName, int dailyTargetMinutes) {
        this(learnerName, dailyTargetMinutes, 0);
    }

    public LearningAccount(
            String learnerName,
            int dailyTargetMinutes,
            int completedMinutes
    ) {
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
        if (minutes <= 0 || minutes > MAX_SESSION_MINUTES) {
            throw new IllegalArgumentException(
                    "单次学习分钟数必须在 1 到 " + MAX_SESSION_MINUTES + " 之间。"
            );
        }

        try {
            completedMinutes = Math.addExact(completedMinutes, minutes);
        } catch (ArithmeticException error) {
            throw new IllegalStateException("累计学习分钟数超出 int 范围。", error);
        }
    }

    public int getRemainingMinutes() {
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
