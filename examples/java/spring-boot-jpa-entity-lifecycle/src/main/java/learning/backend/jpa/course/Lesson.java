package learning.backend.jpa.course;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "lesson")
public class Lesson {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @Column(name = "lesson_position", nullable = false)
    private int position;

    @Column(nullable = false, length = 120)
    private String title;

    protected Lesson() {
    }

    Lesson(Course course, int position, String title) {
        this.course = course;
        this.position = position;
        this.title = title;
    }

    public UUID id() {
        return id;
    }

    public int position() {
        return position;
    }

    public String title() {
        return title;
    }
}
