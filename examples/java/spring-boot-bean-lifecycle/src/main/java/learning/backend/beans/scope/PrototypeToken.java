package learning.backend.beans.scope;

import java.util.UUID;

import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Component;

@Component
@Scope("prototype")
public class PrototypeToken {

    private final String id = UUID.randomUUID().toString();

    public String id() {
        return id;
    }
}
