package learning.backend.jdbc.enrollment;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;

import learning.backend.jdbc.account.AccountNotFoundException;
import learning.backend.jdbc.account.InsufficientCreditsException;
import learning.backend.jdbc.account.LearningAccount;
import learning.backend.jdbc.account.LearningAccountRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EnrollmentService {

    private final LearningAccountRepository accountRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final CreditLedgerRepository ledgerRepository;
    private final Clock clock;

    public EnrollmentService(
            LearningAccountRepository accountRepository,
            EnrollmentRepository enrollmentRepository,
            CreditLedgerRepository ledgerRepository) {
        this.accountRepository = accountRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.ledgerRepository = ledgerRepository;
        this.clock = Clock.systemUTC();
    }

    @Transactional(readOnly = true)
    public AccountOverview findOverview(long accountId) {
        LearningAccount account = requireAccount(accountId);
        return new AccountOverview(account, enrollmentRepository.findByAccountId(accountId));
    }

    @Transactional
    public Enrollment enroll(long accountId, EnrollmentRequest request) {
        return performEnrollment(accountId, request, false);
    }

    @Transactional
    public Enrollment enrollThenFailForRollbackDemo(long accountId, EnrollmentRequest request) {
        return performEnrollment(accountId, request, true);
    }

    private Enrollment performEnrollment(
            long accountId,
            EnrollmentRequest request,
            boolean failAfterDebit) {
        boolean debited = accountRepository.debitCreditsIfAvailable(accountId, request.credits());
        if (!debited) {
            requireAccount(accountId);
            throw new InsufficientCreditsException(accountId, request.credits());
        }

        if (failAfterDebit) {
            throw new IllegalStateException("演示异常：扣减后中止事务。");
        }

        LocalDateTime now = LocalDateTime.now(clock);
        Enrollment enrollment = new Enrollment(
                UUID.randomUUID().toString(),
                accountId,
                request.courseCode(),
                request.credits(),
                now);

        try {
            enrollmentRepository.insert(enrollment);
        } catch (DataIntegrityViolationException error) {
            throw new DuplicateEnrollmentException(accountId, request.courseCode(), error);
        }

        ledgerRepository.recordDebit(
                UUID.randomUUID().toString(),
                accountId,
                request.credits(),
                request.courseCode(),
                now);
        return enrollment;
    }

    private LearningAccount requireAccount(long accountId) {
        return accountRepository.findById(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
    }
}
