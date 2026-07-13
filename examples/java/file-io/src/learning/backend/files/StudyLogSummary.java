package learning.backend.files;

public record StudyLogSummary(int entryCount, int totalMinutes) {
    public StudyLogSummary {
        if (entryCount <= 0) {
            throw new IllegalArgumentException("学习日志至少需要一条有效记录。");
        }
        if (totalMinutes <= 0) {
            throw new IllegalArgumentException("累计学习分钟数必须大于 0。");
        }
    }

    public double averageMinutes() {
        return (double) totalMinutes / entryCount;
    }
}
