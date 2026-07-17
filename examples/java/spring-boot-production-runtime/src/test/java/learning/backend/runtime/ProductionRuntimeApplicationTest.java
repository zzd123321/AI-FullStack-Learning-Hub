package learning.backend.runtime;

import learning.backend.runtime.lifecycle.ManagedWorker;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.runtime.instance-name=test-instance",
        "app.runtime.public-base-url=https://learning.example"
})
@AutoConfigureMockMvc
class ProductionRuntimeApplicationTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ManagedWorker worker;

    @Test
    void bindsExternalConfigurationAndStartsManagedLifecycle() throws Exception {
        assertThat(worker.isRunning()).isTrue();

        mockMvc.perform(get("/api/runtime"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.instance").value("test-instance"))
                .andExpect(jsonPath("$.publicBaseUrl").value("https://learning.example"))
                .andExpect(jsonPath("$.readiness").value("ACCEPTING_TRAFFIC"))
                .andExpect(jsonPath("$.workerRunning").value(true));
    }

    @Test
    void exposesLivenessAndReadinessOnMainPort() throws Exception {
        mockMvc.perform(get("/livez"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));

        mockMvc.perform(get("/readyz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
