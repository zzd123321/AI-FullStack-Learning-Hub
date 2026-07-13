package learning.backend.generics;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public final class InMemoryRepository<ID, E extends Identified<ID>> {
    private final Map<ID, E> entities = new LinkedHashMap<>();

    public <S extends E> S save(S entity) {
        Objects.requireNonNull(entity, "实体不能为空。");
        ID id = Objects.requireNonNull(entity.id(), "实体 ID 不能为空。");
        entities.put(id, entity);
        return entity;
    }

    public void saveAll(Iterable<? extends E> source) {
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
