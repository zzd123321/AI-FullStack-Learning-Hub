package learning.backend.mvc.lesson;

import learning.backend.mvc.web.ApiExceptionHandler;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(LessonController.class)
@Import({LessonService.class, ApiExceptionHandler.class})
class LessonControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void bindsQueryDateEnumAndHeader() throws Exception {
        mockMvc.perform(get("/api/lessons")
                        .queryParam("level", "BEGINNER")
                        .queryParam("publishedAfter", "2026-06-30")
                        .header("X-Client-Version", "web-2.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientVersion").value("web-2.0"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].slug").value("java-basics"));
    }

    @Test
    void rejectsInvalidRequestBodyWithFieldViolations() throws Exception {
        mockMvc.perform(post("/api/lessons")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"slug":"Bad Slug","title":"","level":null,
                                 "durationMinutes":1,"topics":[""]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.violations").isArray());
    }

    @Test
    void validatesDirectQueryParameterConstraints() throws Exception {
        mockMvc.perform(get("/api/lessons").queryParam("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("constraint_violation"))
                .andExpect(jsonPath("$.violations[0].field").value("page"));
    }

    @Test
    void returnsNotFoundProblem() throws Exception {
        mockMvc.perform(get("/api/lessons/999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("lesson_not_found"));
    }

    @Test
    void createsLessonWithLocationHeader() throws Exception {
        mockMvc.perform(post("/api/lessons")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"slug":"mvc-testing","title":"MVC 测试",
                                 "level":"INTERMEDIATE","durationMinutes":60,
                                 "topics":["MockMvc","JSON"]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/lessons/3"))
                .andExpect(jsonPath("$.slug").value("mvc-testing"));
    }
}
