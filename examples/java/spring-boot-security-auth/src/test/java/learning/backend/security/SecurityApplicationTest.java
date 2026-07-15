package learning.backend.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SecurityApplicationTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired PasswordEncoder passwordEncoder;

    @Test
    void publicEndpointDoesNotRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/public"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("public"));
    }

    @Test
    void protectedEndpointReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void validCredentialsIssueJwtThatCanAccessScopedEndpoint() throws Exception {
        String token = issueToken("reader", "reader-password");
        mockMvc.perform(get("/api/reports").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.report").value("quarterly-summary"));
    }

    @Test
    void readerTokenCannotAccessAdminEndpoint() throws Exception {
        String token = issueToken("reader", "reader-password");
        mockMvc.perform(get("/api/admin/audit").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void adminRoleSurvivesJwtClaimConversion() throws Exception {
        String token = issueToken("admin", "admin-password");
        mockMvc.perform(get("/api/admin/audit").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.audit").value("admin-only"));
    }

    @Test
    void invalidPasswordDoesNotIssueToken() throws Exception {
        mockMvc.perform(post("/api/auth/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson("reader", "wrong-password")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void sessionLoginPersistsAuthenticationInServerSession() throws Exception {
        MvcResult login = mockMvc.perform(post("/session/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson("reader", "reader-password")))
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);
        assertThat(session).isNotNull();

        mockMvc.perform(get("/session/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("reader"));
    }

    @Test
    void sessionWriteRequiresCsrfToken() throws Exception {
        MvcResult login = mockMvc.perform(post("/session/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson("reader", "reader-password")))
                .andReturn();
        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);

        mockMvc.perform(post("/session/notes")
                        .session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"unsafe without token\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void delegatingEncoderUsesAnAlgorithmIdentifierAndSalt() {
        String first = passwordEncoder.encode("same-password");
        String second = passwordEncoder.encode("same-password");
        assertThat(first).startsWith("{bcrypt}").isNotEqualTo(second);
        assertThat(passwordEncoder.matches("same-password", first)).isTrue();
    }

    private String issueToken(String username, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson(username, password)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andReturn();
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        return json.get("accessToken").asString();
    }

    private String loginJson(String username, String password) throws Exception {
        return objectMapper.writeValueAsString(new Login(username, password));
    }

    private record Login(String username, String password) {
    }
}
