package learning.backend.messaging.broker;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("rabbit")
public class RabbitTopologyConfiguration {

    public static final String EXCHANGE = "learning.events";
    public static final String QUEUE = "learning.order-projection";

    @Bean
    TopicExchange learningExchange() {
        return new TopicExchange(EXCHANGE, true, false);
    }

    @Bean
    Queue orderProjectionQueue() {
        return new Queue(QUEUE, true);
    }

    @Bean
    Binding orderEventsBinding(Queue orderProjectionQueue, TopicExchange learningExchange) {
        return BindingBuilder.bind(orderProjectionQueue)
                .to(learningExchange)
                .with("purchase-order.*");
    }
}
