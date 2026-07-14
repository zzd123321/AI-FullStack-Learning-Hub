package learning.backend.observability;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ObservabilityEndpointsTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsConfigurationResolvedForTheDefaultEnvironment() throws Exception {
        mockMvc.perform(get("/api/runtime"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applicationName").value("backend-observability"))
                .andExpect(jsonPath("$.environmentLabel").value("default"))
                .andExpect(jsonPath("$.greeting").value("你好，配置系统"))
                .andExpect(jsonPath("$.activeProfiles").isEmpty());
    }

    @Test
    void publishesHealthWithoutDetailsByDefault() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist());
    }

    @Test
    void recordsAndPublishesTheCustomCounter() throws Exception {
        mockMvc.perform(get("/api/runtime"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/actuator/metrics/learning.runtime.requests"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("learning.runtime.requests"))
                .andExpect(jsonPath("$.measurements[*].value", hasItem(greaterThanOrEqualTo(1.0))));
    }

    @Test
    void doesNotExposeTheEnvironmentEndpoint() throws Exception {
        mockMvc.perform(get("/actuator/env"))
                .andExpect(status().isNotFound());
    }
}
