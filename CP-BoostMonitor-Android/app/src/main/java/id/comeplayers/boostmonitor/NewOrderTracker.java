package id.comeplayers.boostmonitor;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class NewOrderTracker {
    private final Set<String> seen = new LinkedHashSet<>();
    private boolean initialized;
    NewOrderTracker(Collection<String> saved) { if (saved != null) { seen.addAll(saved); initialized=true; } }
    List<String> observe(Collection<String> refs) {
        List<String> added = new ArrayList<>();
        for(String ref:refs) if(seen.add(ref)) added.add(ref);
        if(!initialized) { initialized=true;added.clear(); }
        return added;
    }
    Set<String> snapshot() { return new LinkedHashSet<>(seen); }
}
