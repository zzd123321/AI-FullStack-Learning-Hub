package learning.backend.messaging.consumer;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

interface OrderProjectionRepository extends JpaRepository<OrderProjection, UUID> {
}
