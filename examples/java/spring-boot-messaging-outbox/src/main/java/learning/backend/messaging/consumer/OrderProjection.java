package learning.backend.messaging.consumer;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "order_projection")
public class OrderProjection {

    @Id
    @Column(name = "order_id")
    private UUID orderId;

    @Column(nullable = false)
    private int applications;

    @Column(name = "last_event_at", nullable = false)
    private Instant lastEventAt;

    protected OrderProjection() {
    }

    public OrderProjection(UUID orderId, Instant lastEventAt) {
        this.orderId = orderId;
        this.applications = 1;
        this.lastEventAt = lastEventAt;
    }

    public int applications() {
        return applications;
    }
}
