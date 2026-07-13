package learning.backend.generics;

import java.util.ArrayList;
import java.util.List;

public final class GenericApiApp {
    private GenericApiApp() {
    }

    public static void main(String[] args) {
        InMemoryRepository<String, LearningResource> repository =
                new InMemoryRepository<>();

        Article article = repository.save(
                new Article("A-001", "理解泛型不变性", 45)
        );
        repository.save(new Video("V-001", "掌握 PECS", 30));
        repository.saveAll(List.of(
                new Article("A-002", "认识类型擦除", 60)
        ));

        System.out.println("save 保留具体返回类型：" + article.getClass().getSimpleName());
        System.out.println("仓库实体数：" + repository.size());
        System.out.println("查找 V-001：" + repository.findById("V-001")
                .map(LearningResource::title)
                .orElse("未找到"));

        List<LearningResource> resources = repository.findAll();
        List<Object> auditValues = new ArrayList<>();
        GenericCollections.copy(resources, auditValues);
        System.out.println("复制到 List<Object>：" + auditValues.size() + " 项");

        int longest = GenericCollections.max(List.of(45, 30, 60));
        System.out.println("最长学习时长：" + longest + " 分钟");

        LearningResource fallback = GenericCollections.firstOrElse(
                List.<LearningResource>of(),
                () -> new Video("V-FALLBACK", "默认资源", 10)
        );
        System.out.println("空列表回退：" + fallback.title());

        try {
            resources.add(new Video("V-002", "越权修改", 20));
        } catch (UnsupportedOperationException error) {
            System.out.println("仓库快照拒绝修改：" + error.getClass().getSimpleName());
        }
    }
}
