package learning.backend.messaging.outbox;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/recorded-messages")
@Profile("!rabbit & !kafka")
public class RecordedMessageController {

    private final RecordingMessagePublisher publisher;

    public RecordedMessageController(RecordingMessagePublisher publisher) {
        this.publisher = publisher;
    }

    @GetMapping
    public List<OutboxMessage> messages() {
        return publisher.publishedMessages();
    }
}
