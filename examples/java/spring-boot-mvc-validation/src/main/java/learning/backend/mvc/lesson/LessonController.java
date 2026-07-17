package learning.backend.mvc.lesson;

import java.net.URI;
import java.time.LocalDate;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lessons")
public class LessonController {

    private final LessonService lessonService;

    public LessonController(LessonService lessonService) {
        this.lessonService = lessonService;
    }

    @GetMapping
    public LessonPage findAll(
            // 原始 query string 先转成 int，再由方法参数约束检查范围。
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "page 不能小于 0") int page,
            @RequestParam(defaultValue = "10")
            @Min(value = 1, message = "size 不能小于 1")
            @Max(value = 50, message = "size 不能大于 50") int size,
            @RequestParam(required = false) LessonLevel level,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate publishedAfter,
            @RequestHeader(name = "X-Client-Version", defaultValue = "unknown") String clientVersion) {
        return lessonService.findAll(page, size, level, publishedAfter, clientVersion);
    }

    @GetMapping("/{id}")
    public LessonView findById(@PathVariable @Positive(message = "id 必须为正数") long id) {
        return lessonService.findById(id);
    }

    @PostMapping
    public ResponseEntity<LessonView> create(@Valid @RequestBody CreateLessonRequest request) {
        // JSON 读取、类型转换和 Bean Validation 全部成功后，方法才会执行到这里。
        LessonView created = lessonService.create(request);
        return ResponseEntity.created(URI.create("/api/lessons/" + created.id())).body(created);
    }
}
