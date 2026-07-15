package learning.backend.messaging.order;

import learning.backend.messaging.outbox.OutboxEvent;
import learning.backend.messaging.outbox.OutboxEventRepository;
import org.springframework.stereotype.Component;

@Component
public class OrderOutboxWriter {

    private final OutboxEventRepository repository;

    public OrderOutboxWriter(OutboxEventRepository repository) {
        this.repository = repository;
    }

    public void save(OutboxEvent event) {
        repository.save(event);
    }
}
