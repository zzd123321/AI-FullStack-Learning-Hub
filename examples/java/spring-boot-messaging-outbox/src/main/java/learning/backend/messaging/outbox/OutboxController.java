package learning.backend.messaging.outbox;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/outbox")
public class OutboxController {

    private final OutboxRelay relay;
    private final OutboxStore store;

    public OutboxController(OutboxRelay relay, OutboxStore store) {
        this.relay = relay;
        this.store = store;
    }

    @PostMapping("/relay")
    public RelayReport relay() {
        return relay.relayBatch();
    }

    @GetMapping("/status")
    public OutboxCounts status() {
        return new OutboxCounts(
                store.count(OutboxStatus.PENDING),
                store.count(OutboxStatus.PUBLISHING),
                store.count(OutboxStatus.PUBLISHED),
                store.count(OutboxStatus.DEAD));
    }

    public record OutboxCounts(long pending, long publishing, long published, long dead) {
    }
}
