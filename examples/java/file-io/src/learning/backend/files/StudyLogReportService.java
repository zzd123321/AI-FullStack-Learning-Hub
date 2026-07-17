package learning.backend.files;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.Locale;

public final class StudyLogReportService {
    public StudyLogSummary generate(Path input, Path output)
            throws IOException, StudyLogFormatException {
        // 顶层方法像流程图一样编排：规范路径 → 读取 → 格式化 → 安全发布。
        Path normalizedInput = requireFilePath(input, "输入文件");
        Path normalizedOutput = requireFilePath(output, "输出文件");
        StudyLogSummary summary = readSummary(normalizedInput);
        String report = formatReport(normalizedInput, summary);
        writeSafely(normalizedOutput, report);
        return summary;
    }

    private StudyLogSummary readSummary(Path input)
            throws IOException, StudyLogFormatException {
        int entryCount = 0;
        int totalMinutes = 0;

        try (BufferedReader reader = Files.newBufferedReader(input, StandardCharsets.UTF_8)) {
            String line;
            int lineNumber = 0;

            while ((line = reader.readLine()) != null) {
                lineNumber++;

                if (line.isBlank() || line.stripLeading().startsWith("#")) {
                    continue;
                }

                int minutes = parseMinutes(line, lineNumber);

                try {
                    totalMinutes = Math.addExact(totalMinutes, minutes);
                } catch (ArithmeticException error) {
                    throw new StudyLogFormatException("累计分钟数超出 int 范围。", error);
                }
                entryCount++;
            }
        }

        if (entryCount == 0) {
            throw new StudyLogFormatException("学习日志没有有效记录。");
        }

        return new StudyLogSummary(entryCount, totalMinutes);
    }

    private int parseMinutes(String line, int lineNumber) throws StudyLogFormatException {
        String[] parts = line.split(",", -1);

        if (parts.length != 2 || parts[0].isBlank()) {
            throw new StudyLogFormatException(
                    "第 " + lineNumber + " 行格式错误，应为：主题,分钟数"
            );
        }

        int minutes;

        try {
            minutes = Integer.parseInt(parts[1].trim());
        } catch (NumberFormatException error) {
            throw new StudyLogFormatException(
                    "第 " + lineNumber + " 行分钟数不是整数：" + parts[1].trim(),
                    error
            );
        }

        if (minutes <= 0 || minutes > 1_440) {
            throw new StudyLogFormatException(
                    "第 " + lineNumber + " 行分钟数必须在 1 到 1440 之间。"
            );
        }

        return minutes;
    }

    private String formatReport(Path input, StudyLogSummary summary) {
        return String.format(
                Locale.ROOT,
                "学习日志报告%n来源文件：%s%n有效记录：%d 条%n"
                        + "累计学习：%d 分钟%n平均时长：%.1f 分钟%n",
                input.getFileName(),
                summary.entryCount(),
                summary.totalMinutes(),
                summary.averageMinutes()
        );
    }

    private void writeSafely(Path output, String content) throws IOException {
        Path parent = output.getParent();
        Files.createDirectories(parent);

        // 先写同目录临时文件，避免程序中途失败时把半份报告留在正式路径。
        Path temporary = Files.createTempFile(
                parent,
                "." + output.getFileName() + "-",
                ".tmp"
        );
        boolean published = false;

        try {
            Files.writeString(
                    temporary,
                    content,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.WRITE,
                    StandardOpenOption.TRUNCATE_EXISTING
            );

            try {
                // 同一文件系统支持时，原子移动让其他进程只看到旧文件或完整新文件。
                Files.move(
                        temporary,
                        output,
                        StandardCopyOption.ATOMIC_MOVE,
                        StandardCopyOption.REPLACE_EXISTING
                );
            } catch (AtomicMoveNotSupportedException | FileAlreadyExistsException error) {
                // 原子移动不是所有文件系统都支持；回退仍会替换文件，但保证较弱。
                Files.move(temporary, output, StandardCopyOption.REPLACE_EXISTING);
            }
            published = true;
        } finally {
            // 发布失败时清理临时文件；成功移动后 temporary 已经不存在。
            if (!published) {
                Files.deleteIfExists(temporary);
            }
        }
    }

    private Path requireFilePath(Path path, String fieldName) {
        if (path == null) {
            throw new IllegalArgumentException(fieldName + "路径不能为空。");
        }

        Path normalized = path.toAbsolutePath().normalize();

        if (normalized.getFileName() == null) {
            throw new IllegalArgumentException(fieldName + "必须指向文件名。");
        }

        return normalized;
    }
}
