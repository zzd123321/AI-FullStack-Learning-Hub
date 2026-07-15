package learning.backend.tasks.scheduling;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final ReconciliationJob reconciliationJob;

    public JobController(ReconciliationJob reconciliationJob) {
        this.reconciliationJob = reconciliationJob;
    }

    @GetMapping("/reconciliation")
    public JobDiagnostics reconciliation() {
        return reconciliationJob.diagnostics();
    }
}
