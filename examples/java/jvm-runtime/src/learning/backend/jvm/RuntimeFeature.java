package learning.backend.jvm;

public final class RuntimeFeature {
    public static final String COMPILE_TIME_NAME = "JVM";
    private static final int FEATURE_VERSION = initializeFeatureVersion();

    private RuntimeFeature() {
    }

    public static int featureVersion() {
        return FEATURE_VERSION;
    }

    private static int initializeFeatureVersion() {
        System.out.println("初始化：RuntimeFeature");
        return Runtime.version().feature();
    }
}
