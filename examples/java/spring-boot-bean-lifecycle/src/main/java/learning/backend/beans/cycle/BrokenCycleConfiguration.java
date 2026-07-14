package learning.backend.beans.cycle;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("broken-cycle")
public class BrokenCycleConfiguration {

    @Bean
    CycleA cycleA(CycleB cycleB) {
        return new CycleA(cycleB);
    }

    @Bean
    CycleB cycleB(CycleA cycleA) {
        return new CycleB(cycleA);
    }

    record CycleA(CycleB cycleB) {
    }

    record CycleB(CycleA cycleA) {
    }
}
