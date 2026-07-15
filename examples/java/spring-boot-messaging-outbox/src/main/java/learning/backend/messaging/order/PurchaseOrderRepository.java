package learning.backend.messaging.order;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, UUID> {
}
