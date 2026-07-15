package learning.backend.jpa.course;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "instructor")
public class Instructor {

    @Id
    private Long id;

    @Column(name = "display_name", nullable = false, length = 80)
    private String displayName;

    protected Instructor() {
    }

    public Long id() {
        return id;
    }

    public String displayName() {
        return displayName;
    }
}
