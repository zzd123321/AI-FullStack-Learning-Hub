package learning.backend.messaging.order;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import learning.backend.messaging.outbox.OutboxEvent;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class OrderApplicationService {

    private final PurchaseOrderRepository orders;
    private final OrderOutboxWriter outboxWriter;
    private final ObjectMapper objectMapper;
    private final Clock clock = Clock.systemUTC();

    public OrderApplicationService(
            PurchaseOrderRepository orders,
            OrderOutboxWriter outboxWriter,
            ObjectMapper objectMapper) {
        this.orders = orders;
        this.outboxWriter = outboxWriter;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public OrderCreatedResponse create(CreateOrderRequest request) {
        Instant now = Instant.now(clock);
        UUID orderId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        PurchaseOrder order = new PurchaseOrder(
                orderId,
                request.customerId(),
                request.totalCents(),
                now);
        // 订单和 Outbox 行在同一数据库事务中提交，避免“订单成功但消息尚未记录”。
        orders.save(order);

        String payload = objectMapper.writeValueAsString(new OrderCreatedPayload(
                orderId,
                request.customerId(),
                request.totalCents(),
                now));
        // 此处只写 Outbox，不直接假设 Broker 发送与数据库提交可以原子完成。
        outboxWriter.save(new OutboxEvent(
                eventId,
                "PurchaseOrder",
                orderId.toString(),
                "OrderCreated.v1",
                payload,
                now));
        return new OrderCreatedResponse(orderId, order.status(), eventId);
    }

    @Transactional
    public void createThenFail(CreateOrderRequest request) {
        // 该调用仍经过当前事务；随后异常会让订单与 Outbox 一起回滚。
        create(request);
        throw new IllegalStateException("模拟业务事务回滚");
    }

    private record OrderCreatedPayload(
            UUID orderId,
            String customerId,
            int totalCents,
            Instant occurredAt) {
    }
}
