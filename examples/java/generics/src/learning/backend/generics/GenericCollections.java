package learning.backend.generics;

import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;

public final class GenericCollections {
    private GenericCollections() {
    }

    public static <T> void copy(
            Iterable<? extends T> source,
            Collection<? super T> target
    ) {
        Objects.requireNonNull(source, "来源不能为空。");
        Objects.requireNonNull(target, "目标不能为空。");

        for (T element : source) {
            target.add(element);
        }
    }

    public static <T> T firstOrElse(
            List<? extends T> source,
            Supplier<? extends T> fallback
    ) {
        Objects.requireNonNull(source, "来源不能为空。");
        Objects.requireNonNull(fallback, "默认值工厂不能为空。");
        return source.isEmpty() ? fallback.get() : source.get(0);
    }

    public static <T extends Comparable<? super T>> T max(List<? extends T> source) {
        Objects.requireNonNull(source, "来源不能为空。");
        if (source.isEmpty()) {
            throw new IllegalArgumentException("求最大值的列表不能为空。");
        }

        T maximum = Objects.requireNonNull(source.get(0), "元素不能为空。");
        for (int index = 1; index < source.size(); index++) {
            T candidate = Objects.requireNonNull(source.get(index), "元素不能为空。");
            if (candidate.compareTo(maximum) > 0) {
                maximum = candidate;
            }
        }
        return maximum;
    }
}
