package learning.backend.cache.catalog;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "catalog_course")
public class CatalogCourse {

    @Id
    private UUID id;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(name = "price_cents", nullable = false)
    private int priceCents;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CatalogCourse() {
    }

    public void update(String title, int priceCents, Instant now) {
        this.title = title;
        this.priceCents = priceCents;
        this.updatedAt = now;
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

    public int priceCents() {
        return priceCents;
    }

    public Instant updatedAt() {
        return updatedAt;
    }
}
