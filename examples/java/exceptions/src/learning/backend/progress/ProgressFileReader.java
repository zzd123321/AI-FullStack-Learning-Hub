package learning.backend.progress;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ProgressFileReader {
    public ProgressSummary read(Path path) throws ProgressFileException {
        if (path == null) {
            throw new IllegalArgumentException("文件路径不能为空。");
        }

        int entryCount = 0;
        int totalMinutes = 0;

        try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
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
                    throw new ProgressFileException("累计分钟数超出 int 范围。", error);
                }
                entryCount++;
            }
        } catch (IOException error) {
            throw new ProgressFileException("无法读取进度文件：" + path, error);
        }

        return new ProgressSummary(entryCount, totalMinutes);
    }

    private int parseMinutes(String line, int lineNumber) throws ProgressFileException {
        String[] parts = line.split(",", -1);

        if (parts.length != 2 || parts[0].isBlank()) {
            throw new ProgressFileException(
                    "第 " + lineNumber + " 行格式错误，应为：主题,分钟数"
            );
        }

        int minutes;

        try {
            minutes = Integer.parseInt(parts[1].trim());
        } catch (NumberFormatException error) {
            throw new ProgressFileException(
                    "第 " + lineNumber + " 行的分钟数必须是整数：" + parts[1].trim(),
                    error
            );
        }

        if (minutes <= 0 || minutes > 1_440) {
            throw new ProgressFileException(
                    "第 " + lineNumber + " 行的分钟数必须在 1 到 1440 之间。"
            );
        }

        return minutes;
    }
}
