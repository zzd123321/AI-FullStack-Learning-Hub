package learning.backend.jpa.course;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "course")
public class Course {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Version
    @Column(nullable = false)
    private Long version;

    @Column(nullable = false, unique = true, length = 40)
    private String code;

    @Column(nullable = false, length = 120)
    private String title;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "instructor_id", nullable = false)
    private Instructor instructor;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "course", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<Lesson> lessons = new ArrayList<>();

    protected Course() {
    }

    public Course(String code, String title, Instructor instructor, Instant createdAt) {
        this.code = requireText(code, "code");
        this.title = requireText(title, "title");
        this.instructor = instructor;
        this.createdAt = createdAt;
    }

    public void rename(String newTitle) {
        this.title = requireText(newTitle, "title");
    }

    public Lesson addLesson(int position, String lessonTitle) {
        if (position <= 0) {
            throw new IllegalArgumentException("课时顺序必须大于 0");
        }
        Lesson lesson = new Lesson(this, position, requireText(lessonTitle, "lessonTitle"));
        lessons.add(lesson);
        return lesson;
    }

    public boolean removeLesson(UUID lessonId) {
        return lessons.removeIf(lesson -> lesson.id().equals(lessonId));
    }

    public UUID id() {
        return id;
    }

    public long version() {
        return version == null ? 0L : version;
    }

    public String code() {
        return code;
    }

    public String title() {
        return title;
    }

    public Instructor instructor() {
        return instructor;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public List<Lesson> lessons() {
        return Collections.unmodifiableList(lessons);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " 不能为空");
        }
        return value.strip();
    }
}
