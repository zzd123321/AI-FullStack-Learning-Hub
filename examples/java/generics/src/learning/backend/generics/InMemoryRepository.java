package learning.backend.generics;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public final class InMemoryRepository<ID, E extends Identified<ID>> {
    // ID 是键类型；E 必须能提供同类型 ID，因此 save 不需要强制转换。
    private final Map<ID, E> entities = new LinkedHashMap<>();

    public <S extends E> S save(S entity) {
        // 方法自己的 S 保留调用方传入的具体子类型，返回值不会被放宽成 E。
        Objects.requireNonNull(entity, "实体不能为空。");
        ID id = Objects.requireNonNull(entity.id(), "实体 ID 不能为空。");
        entities.put(id, entity);
        return entity;
    }

    public void saveAll(Iterable<? extends E> source) {
        // extends 表示这里只从 source 读取 E，不向未知具体类型的容器写入。
        Objects.requireNonNull(source, "实体来源不能为空。");
        for (E entity : source) {
            save(entity);
        }
    }

    public Optional<E> findById(ID id) {
        Objects.requireNonNull(id, "查询 ID 不能为空。");
        return Optional.ofNullable(entities.get(id));
    }

    public List<E> findAll() {
        return List.copyOf(entities.values());
    }

    public boolean removeById(ID id) {
        Objects.requireNonNull(id, "删除 ID 不能为空。");
        return entities.remove(id) != null;
    }

    public int size() {
        return entities.size();
    }
}
