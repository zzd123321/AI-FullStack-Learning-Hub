package learning.backend.messaging.outbox;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select event from OutboxEvent event
            where (event.status = learning.backend.messaging.outbox.OutboxStatus.PENDING
                   and event.nextAttemptAt <= :now)
               or (event.status = learning.backend.messaging.outbox.OutboxStatus.PUBLISHING
                   and event.lockedUntil < :now)
            order by event.createdAt, event.id
            """)
    List<OutboxEvent> lockPublishable(
            @Param("now") Instant now,
            Pageable pageable);

    long countByStatus(OutboxStatus status);
}
