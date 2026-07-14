package learning.backend.observability;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
class DevelopmentProfileTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void profileSpecificConfigurationOverridesTheBaseConfiguration() throws Exception {
        mockMvc.perform(get("/api/runtime"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.environmentLabel").value("development"))
                .andExpect(jsonPath("$.greeting").value("你好，开发环境"))
                .andExpect(jsonPath("$.activeProfiles", hasItem("dev")));
    }

    @Test
    void developmentProfileAllowsHealthDetails() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.learningContent.details.catalog").value("ready"));
    }
}
