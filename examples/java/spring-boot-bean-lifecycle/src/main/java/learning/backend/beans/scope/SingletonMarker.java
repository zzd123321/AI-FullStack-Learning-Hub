package learning.backend.beans.scope;

import java.util.UUID;

import org.springframework.stereotype.Component;

@Component
public class SingletonMarker {

    private final String id = UUID.randomUUID().toString();

    public String id() {
        return id;
    }
}
