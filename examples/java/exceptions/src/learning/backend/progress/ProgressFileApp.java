package learning.backend.progress;

import java.nio.file.Path;

public final class ProgressFileApp {
    private ProgressFileApp() {
    }

    public static void main(String[] args) {
        if (args.length != 1) {
            System.err.println("用法：java learning.backend.progress.ProgressFileApp <进度文件>");
            System.exit(2);
            return;
        }

        try {
            ProgressSummary summary = new ProgressFileReader().read(Path.of(args[0]));
            System.out.printf("有效记录：%d 条%n", summary.entryCount());
            System.out.printf("累计学习：%d 分钟%n", summary.totalMinutes());
        } catch (ProgressFileException error) {
            System.err.println("错误：" + error.getMessage());

            if (error.getCause() != null) {
                System.err.println("原因类型：" + error.getCause().getClass().getSimpleName());
            }

            System.exit(1);
        }
    }
}
