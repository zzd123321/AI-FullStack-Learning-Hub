package learning.backend.jpaquery.catalog;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "catalog_course")
public class CatalogCourse {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Version
    @Column(nullable = false)
    private Long version;

    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, length = 160)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CourseCategory category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CourseStatus status;

    @Column(name = "price_cents", nullable = false)
    private int priceCents;

    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;

    protected CatalogCourse() {
    }

    public CatalogCourse(
            String code,
            String title,
            CourseCategory category,
            CourseStatus status,
            int priceCents,
            Instant publishedAt) {
        this.code = code;
        this.title = title;
        this.category = category;
        this.status = status;
        this.priceCents = priceCents;
        this.publishedAt = publishedAt;
    }

    public UUID id() {
        return id;
    }

    public String code() {
        return code;
    }

    public String title() {
        return title;
    }

    public CourseCategory category() {
        return category;
    }

    public CourseStatus status() {
        return status;
    }

    public int priceCents() {
        return priceCents;
    }

    public Instant publishedAt() {
        return publishedAt;
    }
}
