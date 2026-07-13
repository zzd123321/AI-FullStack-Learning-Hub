package learning.backend.files;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class StudyLogReportApp {
    private StudyLogReportApp() {
    }

    public static void main(String[] args) {
        if (args.length != 2) {
            printUsage();
            System.exit(2);
            return;
        }

        try {
            Path input = Path.of(args[0]);
            Path output = Path.of(args[1]);
            StudyLogSummary summary = new StudyLogReportService().generate(input, output);

            System.out.printf("报告已生成：%s%n", output.toAbsolutePath().normalize());
            System.out.printf("共 %d 条记录，%d 分钟。%n",
                    summary.entryCount(), summary.totalMinutes());
            System.out.println("--- 报告内容 ---");
            System.out.print(Files.readString(output, StandardCharsets.UTF_8));
        } catch (IllegalArgumentException error) {
            System.err.println("输入错误：" + error.getMessage());
            System.exit(2);
        } catch (StudyLogFormatException error) {
            System.err.println("数据错误：" + error.getMessage());
            System.exit(2);
        } catch (IOException error) {
            System.err.println("文件错误：" + error.getMessage());
            System.exit(1);
        }
    }

    private static void printUsage() {
        System.err.println(
                "用法：java learning.backend.files.StudyLogReportApp <输入文件> <输出文件>"
        );
    }
}
