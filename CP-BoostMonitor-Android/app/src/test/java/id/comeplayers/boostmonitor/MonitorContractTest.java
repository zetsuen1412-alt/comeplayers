package id.comeplayers.boostmonitor;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class MonitorContractTest {
    @Test public void payrollOnlyQueueCannotBeDisplayedAsTelegramIntake() throws Exception {
        JSONObject data = new JSONObject("{\"schema\":2,\"scope\":\"FH3\",\"source\":\"payroll\",\"pending\":[]}");
        assertFalse(MonitorContract.pending(data));
        data.put("sourceOfTruth", "telegram_fh3_manual"); assertTrue(MonitorContract.pending(data));
        data.put("scope", "FH2"); assertFalse(MonitorContract.pending(data));
    }
    @Test public void oldTaskContractCannotUnlockStartDone() throws Exception {
        JSONObject data = new JSONObject("{\"schema\":1,\"scope\":\"FH3\",\"sourceOfTruth\":\"telegram_fh3_manual\",\"tasks\":[]}");
        assertFalse(MonitorContract.tasks(data));
        data.put("workflowSchema", 1); assertTrue(MonitorContract.tasks(data));
        data.remove("tasks"); assertFalse(MonitorContract.tasks(data));
    }
    @Test public void unlinkedOrUncertainOrdersCannotBeTaken() throws Exception {
        JSONObject data = new JSONObject(); assertFalse(MonitorContract.canTake(data));
        data.put("canTake", true); assertTrue(MonitorContract.canTake(data));
        data.put("unlinkedPayroll", true); assertFalse(MonitorContract.canTake(data));
        data.put("canTakeWithoutPayroll", true); assertTrue(MonitorContract.canTake(data));
        data.put("unlinkedPayroll", false); data.put("deliveryUncertain", true);
        assertFalse(MonitorContract.canTake(data));
    }
    @Test public void salaryDataRequiresExplicitScopeCurrencyAndWorkContract() throws Exception {
        JSONObject data = new JSONObject("{\"schema\":1,\"scope\":\"FH3\",\"currency\":\"IDR\",\"employees\":[],\"work\":[]}");
        assertTrue(MonitorContract.earnings(data)); data.put("currency", "USD");
        assertFalse(MonitorContract.earnings(data)); assertFalse(MonitorContract.earnings(null));
    }
}
