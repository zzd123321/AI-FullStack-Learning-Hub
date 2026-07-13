package learning.backend.progress;

public record ProgressSummary(int entryCount, int totalMinutes) {
    public ProgressSummary {
        if (entryCount < 0 || totalMinutes < 0) {
            throw new IllegalArgumentException("统计值不能为负数。");
        }
    }
}
