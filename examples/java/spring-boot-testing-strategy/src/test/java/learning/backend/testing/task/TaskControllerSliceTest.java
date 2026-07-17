package learning.backend.testing.task;

import learning.backend.testing.web.ApiExceptionHandler;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TaskController.class)
@Import(ApiExceptionHandler.class)
class TaskControllerSliceTest {
    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskService service;

    @Test
    void serializesSuccessfulResponse() throws Exception {
        when(service.find("T-1"))
                .thenReturn(new LearningTask("T-1", "学习 MVC 测试", false));

        mockMvc.perform(get("/api/tasks/T-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("T-1"))
                .andExpect(jsonPath("$.completed").value(false));
    }

    @Test
    void mapsBusinessFailureToNotFoundResponse() throws Exception {
        when(service.find("missing"))
                .thenThrow(new TaskNotFoundException("missing"));

        mockMvc.perform(get("/api/tasks/missing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("task_not_found"));
    }
}
