package learning.backend.generics;

public sealed interface LearningResource extends Identified<String>
        permits Article, Video {
    String title();
}
