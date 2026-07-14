package learning.backend.diagnostics;

import jdk.jfr.Category;
import jdk.jfr.Description;
import jdk.jfr.Event;
import jdk.jfr.Label;
import jdk.jfr.Name;
import jdk.jfr.StackTrace;

@Name("learning.backend.CourseBatch")
@Label("Course Batch")
@Category({"Learning", "Backend"})
@Description("Records one bounded diagnostic allocation batch")
@StackTrace(false)
public final class CourseBatchEvent extends Event {
    @Label("Batch Count")
    int batchCount;

    @Label("Allocated KiB")
    long allocatedKiB;
}
