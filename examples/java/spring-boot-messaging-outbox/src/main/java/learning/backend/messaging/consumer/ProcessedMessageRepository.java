package learning.backend.messaging.consumer;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

interface ProcessedMessageRepository extends JpaRepository<ProcessedMessage, UUID> {

    boolean existsByConsumerNameAndEventId(String consumerName, UUID eventId);
}
