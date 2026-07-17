package learning.backend.testing.task;

import java.util.Optional;

public interface TaskRepository {
    Optional<LearningTask> findById(String id);

    LearningTask save(LearningTask task);
}
