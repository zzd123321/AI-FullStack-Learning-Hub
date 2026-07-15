package learning.backend.jdbc.enrollment;

import java.util.List;

import learning.backend.jdbc.account.LearningAccount;

public record AccountOverview(LearningAccount account, List<Enrollment> enrollments) {
}
