package id.comeplayers.boostmonitor;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class MonitorContractTest {
    @Test public void onlyConfirmedTakeMayChangeStatus() throws Exception {
        JSONObject result = new JSONObject("{\"ok\":true,\"assigned\":true,\"takeSent\":false}");
        assertFalse(MonitorContract.confirmedTake(result));
        result.put("takeSent", true); assertTrue(MonitorContract.confirmedTake(result));
        result.put("takeSent", "true"); assertFalse(MonitorContract.confirmedTake(result));
        result.put("takeSent", true).put("ok", false); assertFalse(MonitorContract.confirmedTake(result));
        assertFalse(MonitorContract.confirmedTake(null));
    }
    @Test public void automaticWorkPreservesManualSleepAndAvoidsRepeatedEvents() {
        assertTrue(MonitorContract.canMarkWorking("READY")); assertTrue(MonitorContract.canMarkWorking("IDLE"));
        for(String status : new String[]{"SLEEP","WORK","BREAK","OFFLINE","invalid"}) assertFalse(MonitorContract.canMarkWorking(status));
        assertFalse(MonitorContract.canMarkWorking(null));
    }
    @Test public void onlyLiveConfirmedTasksReconcileWorkFromAnotherDevice() throws Exception {
        JSONObject task = new JSONObject("{\"orderRef\":\"X200\",\"employeeId\":\"e1\",\"employeeCode\":\"E1\",\"status\":\"assigned\",\"takeStatus\":\"sent\",\"canStart\":true}");
        assertTrue(MonitorContract.confirmedActiveTake(task));
        for(String state : new String[]{"missing","unknown","failed"}) { task.put("takeStatus",state); assertFalse(MonitorContract.confirmedActiveTake(task)); }
        task.put("takeStatus","sent").put("deliveryUncertain",true); assertFalse(MonitorContract.confirmedActiveTake(task));
        task.put("deliveryUncertain",false).put("status","completed"); assertFalse(MonitorContract.confirmedActiveTake(task));
        task.put("status","in_progress").put("canStart",false).put("canDone",true); assertTrue(MonitorContract.confirmedActiveTake(task));
        task.put("canDone",false); assertFalse(MonitorContract.confirmedActiveTake(task));
        task.put("canDone",true).remove("employeeId"); assertFalse(MonitorContract.confirmedActiveTake(task));
    }
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
