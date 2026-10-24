package id.comeplayers.boostmonitor;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;
public final class NewOrderTrackerTest {
 @Test public void newOrdersNotifyOnceAndSurviveRestart(){
  NewOrderTracker tracker=new NewOrderTracker(null);
  assertTrue(tracker.observe(Arrays.asList("X100","X101")).isEmpty());
  assertEquals(Collections.singletonList("X102"),tracker.observe(Arrays.asList("X101","X102","X102")));
  assertTrue(tracker.observe(Collections.emptyList()).isEmpty());
  assertTrue(tracker.observe(Collections.singletonList("X100")).isEmpty());
  assertEquals(Collections.singletonList("X103"),new NewOrderTracker(tracker.snapshot()).observe(Arrays.asList("X102","X103")));
 }
 @Test public void differentAccountsHaveIndependentBaselines(){
  NewOrderTracker a=new NewOrderTracker(Collections.singleton("X100"));
  NewOrderTracker b=new NewOrderTracker(null);
  assertEquals(Collections.singletonList("X101"),a.observe(Collections.singletonList("X101")));
  assertTrue(b.observe(Collections.singletonList("X101")).isEmpty());
 }
}
