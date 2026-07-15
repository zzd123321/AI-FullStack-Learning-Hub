package learning.backend.messaging;

import java.time.Instant;
import java.util.UUID;

import learning.backend.messaging.consumer.ConsumptionResult;
import learning.backend.messaging.consumer.IdempotentOrderConsumer;
import learning.backend.messaging.order.CreateOrderRequest;
import learning.backend.messaging.order.OrderApplicationService;
import learning.backend.messaging.order.OrderCreatedResponse;
import learning.backend.messaging.outbox.OutboxMessage;
import learning.backend.messaging.outbox.OutboxMessageCodec;
import learning.backend.messaging.outbox.OutboxRelay;
import learning.backend.messaging.outbox.RecordingMessagePublisher;
import learning.backend.messaging.outbox.RelayReport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.outbox.initial-delay=PT1H")
@AutoConfigureMockMvc
class MessagingOutboxApplicationTest {

    @Autowired
    private OrderApplicationService orderService;

    @Autowired
    private OutboxRelay relay;

    @Autowired
    private RecordingMessagePublisher publisher;

    @Autowired
    private IdempotentOrderConsumer consumer;

    @Autowired
    private OutboxMessageCodec codec;

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private MockMvc mockMvc;

    @BeforeEach
    void resetDatabaseAndPublisher() {
        jdbcClient.sql("DELETE FROM processed_message").update();
        jdbcClient.sql("DELETE FROM order_projection").update();
        jdbcClient.sql("DELETE FROM outbox_event").update();
        jdbcClient.sql("DELETE FROM purchase_order").update();
        publisher.clear();
    }

    @Test
    void orderAndOutboxEventCommitInOneDatabaseTransaction() {
        OrderCreatedResponse response = orderService.create(
                new CreateOrderRequest("customer-001", 12900));

        assertThat(count("purchase_order")).isEqualTo(1);
        assertThat(count("outbox_event")).isEqualTo(1);
        assertThat(outboxStatus(response.outboxEventId())).isEqualTo("PENDING");
    }

    @Test
    void rollbackRemovesBothBusinessRowAndOutboxRow() {
        assertThatThrownBy(() -> orderService.createThenFail(
                new CreateOrderRequest("customer-rollback", 9900)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("模拟业务事务回滚");

        assertThat(count("purchase_order")).isZero();
        assertThat(count("outbox_event")).isZero();
    }

    @Test
    void relayPublishesThenMarksEventPublished() {
        OrderCreatedResponse order = orderService.create(
                new CreateOrderRequest("customer-relay", 15900));

        RelayReport report = relay.relayBatch();

        assertThat(report).isEqualTo(new RelayReport(1, 1, 0));
        assertThat(publisher.publishedMessages())
                .extracting(OutboxMessage::eventId)
                .containsExactly(order.outboxEventId());
        assertThat(outboxStatus(order.outboxEventId())).isEqualTo("PUBLISHED");
    }

    @Test
    void temporaryBrokerFailureReturnsEventToPendingWithBackoff() {
        OrderCreatedResponse order = orderService.create(
                new CreateOrderRequest("customer-retry", 17900));
        publisher.failNextPublish();

        RelayReport report = relay.relayBatch();

        assertThat(report).isEqualTo(new RelayReport(1, 0, 1));
        assertThat(outboxStatus(order.outboxEventId())).isEqualTo("PENDING");
        assertThat(outboxAttempts(order.outboxEventId())).isEqualTo(1);
        assertThat(publisher.publishedMessages()).isEmpty();
        assertThat(relay.relayBatch().claimed()).isZero();
    }

    @Test
    void duplicateDeliveryIsAppliedOnlyOnceByConsumer() {
        OrderCreatedResponse order = orderService.create(
                new CreateOrderRequest("customer-duplicate", 18900));
        relay.relayBatch();
        OutboxMessage message = publisher.find(order.outboxEventId());

        assertThat(consumer.consume(message)).isEqualTo(ConsumptionResult.APPLIED);
        assertThat(consumer.consume(message)).isEqualTo(ConsumptionResult.DUPLICATE);
        assertThat(count("processed_message")).isEqualTo(1);
        assertThat(jdbcClient.sql("""
                        SELECT applications FROM order_projection WHERE order_id = :orderId
                        """)
                .param("orderId", order.orderId())
                .query(Integer.class)
                .single()).isEqualTo(1);
    }

    @Test
    void envelopeCodecPreservesIdentityAndPayload() {
        OutboxMessage original = new OutboxMessage(
                UUID.randomUUID(),
                "PurchaseOrder",
                UUID.randomUUID().toString(),
                "OrderCreated.v1",
                "{\"totalCents\":12900}",
                Instant.parse("2026-07-15T00:00:00Z"));

        assertThat(codec.decode(codec.encode(original))).isEqualTo(original);
    }

    @Test
    void httpCreatesOrderAndManualRelayMakesMessageObservable() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType("application/json")
                        .content("""
                                {
                                  "customerId": "customer-http",
                                  "totalCents": 20900
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("CREATED"));

        mockMvc.perform(post("/api/outbox/relay"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(1));
        mockMvc.perform(get("/api/recorded-messages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].eventType").value("OrderCreated.v1"));
    }

    private long count(String table) {
        return jdbcClient.sql("SELECT COUNT(*) FROM " + table)
                .query(Long.class)
                .single();
    }

    private String outboxStatus(UUID eventId) {
        return jdbcClient.sql("SELECT status FROM outbox_event WHERE id = :id")
                .param("id", eventId)
                .query(String.class)
                .single();
    }

    private int outboxAttempts(UUID eventId) {
        return jdbcClient.sql("SELECT attempts FROM outbox_event WHERE id = :id")
                .param("id", eventId)
                .query(Integer.class)
                .single();
    }
}
