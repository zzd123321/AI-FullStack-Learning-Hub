package learning.backend.loom.preview;

import java.lang.ScopedValue;
import java.util.concurrent.StructuredTaskScope;

public final class StructuredDashboardService {
    private static final ScopedValue<RequestContext> REQUEST_CONTEXT =
            ScopedValue.newInstance();

    public LearningDashboard loadDashboard(RequestContext context)
            throws InterruptedException {
        return ScopedValue.where(REQUEST_CONTEXT, context)
                .call(this::loadDashboardInScope);
    }

    private LearningDashboard loadDashboardInScope()
            throws InterruptedException {
        try (var scope = StructuredTaskScope.<Object>open()) {
            StructuredTaskScope.Subtask<ProfileResult> profile =
                    scope.fork(this::loadProfile);
            StructuredTaskScope.Subtask<StatsResult> stats =
                    scope.fork(this::loadStats);

            scope.join();
            ProfileResult profileResult = profile.get();
            StatsResult statsResult = stats.get();
            String requestId = REQUEST_CONTEXT.get().requestId();

            return new LearningDashboard(
                    profileResult.displayName(),
                    statsResult.completedCourses(),
                    requestId,
                    requestId.equals(profileResult.requestId())
                            && requestId.equals(statsResult.requestId())
            );
        }
    }

    private ProfileResult loadProfile() throws InterruptedException {
        Thread.sleep(30);
        RequestContext context = REQUEST_CONTEXT.get();
        if (!"U-001".equals(context.userId())) {
            throw new IllegalArgumentException("用户不存在：" + context.userId());
        }
        return new ProfileResult("小林", context.requestId());
    }

    private StatsResult loadStats() throws InterruptedException {
        Thread.sleep(20);
        RequestContext context = REQUEST_CONTEXT.get();
        return new StatsResult(17, context.requestId());
    }

    private record ProfileResult(String displayName, String requestId) {
    }

    private record StatsResult(int completedCourses, String requestId) {
    }
}
