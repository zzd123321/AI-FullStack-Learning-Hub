package learning.backend.testing;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class TestingApplicationTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void fullApplicationConnectsControllerServiceAndRepository() throws Exception {
        // 这里不替换任何业务 Bean，用真实对象图验证 Spring 装配和跨层协作。
        mockMvc.perform(get("/api/tasks/T-100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("理解测试边界"));
    }
}
