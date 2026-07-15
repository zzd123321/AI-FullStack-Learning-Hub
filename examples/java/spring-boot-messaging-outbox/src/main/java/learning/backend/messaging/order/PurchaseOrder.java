package learning.backend.messaging.order;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "purchase_order")
public class PurchaseOrder {

    @Id
    private UUID id;

    @Column(name = "customer_id", nullable = false, length = 80)
    private String customerId;

    @Column(name = "total_cents", nullable = false)
    private int totalCents;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PurchaseOrder() {
    }

    public PurchaseOrder(UUID id, String customerId, int totalCents, Instant createdAt) {
        this.id = id;
        this.customerId = customerId;
        this.totalCents = totalCents;
        this.status = "CREATED";
        this.createdAt = createdAt;
    }

    public UUID id() {
        return id;
    }

    public String customerId() {
        return customerId;
    }

    public int totalCents() {
        return totalCents;
    }

    public String status() {
        return status;
    }

    public Instant createdAt() {
        return createdAt;
    }
}
