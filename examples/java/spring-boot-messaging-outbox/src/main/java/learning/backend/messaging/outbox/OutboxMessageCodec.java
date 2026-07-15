package learning.backend.messaging.outbox;

import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
public class OutboxMessageCodec {

    private final ObjectMapper objectMapper;

    public OutboxMessageCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String encode(OutboxMessage message) {
        return objectMapper.writeValueAsString(message);
    }

    public OutboxMessage decode(String json) {
        try {
            return objectMapper.readValue(json, OutboxMessage.class);
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("无法解析消息 envelope", exception);
        }
    }
}
