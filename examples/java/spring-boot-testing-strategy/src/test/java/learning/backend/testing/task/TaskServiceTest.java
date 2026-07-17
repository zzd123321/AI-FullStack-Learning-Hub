package learning.backend.testing.task;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskServiceTest {
    @Mock
    private TaskRepository repository;

    @InjectMocks
    private TaskService service;

    @Test
    void completesPendingTaskAndSavesNewState() {
        LearningTask pending = new LearningTask("T-1", "学习单元测试", false);
        when(repository.findById("T-1")).thenReturn(Optional.of(pending));

        LearningTask result = service.complete("T-1");

        assertThat(result.completed()).isTrue();
        verify(repository).save(result);
    }

    @Test
    void doesNotSaveTaskThatWasAlreadyCompleted() {
        LearningTask completed = new LearningTask("T-1", "学习单元测试", true);
        when(repository.findById("T-1")).thenReturn(Optional.of(completed));

        LearningTask result = service.complete("T-1");

        assertThat(result).isSameAs(completed);
        verify(repository, never()).save(completed);
    }

    @Test
    void reportsMissingTaskWithBusinessException() {
        when(repository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.complete("missing"))
                .isInstanceOf(TaskNotFoundException.class)
                .hasMessage("任务不存在：missing");
    }
}
