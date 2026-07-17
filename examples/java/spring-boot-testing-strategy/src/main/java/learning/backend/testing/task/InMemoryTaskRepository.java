package learning.backend.testing.task;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Repository;

@Repository
public final class InMemoryTaskRepository implements TaskRepository {
    private final Map<String, LearningTask> tasks = new ConcurrentHashMap<>();

    public InMemoryTaskRepository() {
        // 固定种子数据让示例启动后立刻可调用，也让集成测试有稳定输入。
        LearningTask seed = new LearningTask("T-100", "理解测试边界", false);
        tasks.put(seed.id(), seed);
    }

    @Override
    public Optional<LearningTask> findById(String id) {
        return Optional.ofNullable(tasks.get(id));
    }

    @Override
    public LearningTask save(LearningTask task) {
        tasks.put(task.id(), task);
        return task;
    }
}
