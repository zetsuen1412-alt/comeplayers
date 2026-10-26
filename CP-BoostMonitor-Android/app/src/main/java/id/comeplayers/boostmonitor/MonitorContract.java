package id.comeplayers.boostmonitor;

import org.json.JSONObject;

/** Shared contract checks are independent of Activity lifecycle and fail closed. */
final class MonitorContract {
    static boolean pending(JSONObject data) {
        return base(data, 2) && "telegram_fh3_manual".equals(data.optString("sourceOfTruth"))
                && data.optJSONArray("pending") != null;
    }
    static boolean tasks(JSONObject data) {
        return base(data, 1) && data.optInt("workflowSchema") == 1
                && "telegram_fh3_manual".equals(data.optString("sourceOfTruth"))
                && data.optJSONArray("tasks") != null;
    }
    static boolean earnings(JSONObject data) {
        return base(data, 1) && "IDR".equals(data.optString("currency"))
                && data.optJSONArray("employees") != null && data.optJSONArray("work") != null;
    }
    static boolean canTake(JSONObject order) {
        return order.optBoolean("canTake", false)
                && (!order.optBoolean("unlinkedPayroll", false) || order.optBoolean("canTakeWithoutPayroll", false))
                && !order.optBoolean("deliveryUncertain", false);
    }
    static boolean confirmedTake(JSONObject data) {
        return data != null && Boolean.TRUE.equals(data.opt("ok")) && Boolean.TRUE.equals(data.opt("takeSent"));
    }
    static boolean canMarkWorking(String current) { return "READY".equals(current) || "IDLE".equals(current); }
    static boolean dailyContext(JSONObject task) {
        if(!task.optBoolean("daily"))return true;
        int total=task.optInt("totalDays"),completed=task.optInt("completedDays",-1);
        long revision=task.optLong("dailyRevision",-1);
        return total>=2&&total<=366&&completed>=0&&completed<total&&task.optInt("dayNumber")==completed+1
            &&revision>=0&&revision<=1000000&&task.optString("dailyCycleId").matches("[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}");
    }
    static boolean canProof(JSONObject task,String action) {
        if(task==null||task.optBoolean("deliveryUncertain")||!dailyContext(task))return false;
        String flag,status;
        switch(action){
            case "start":flag="canStart";status="assigned";break;
            case "pause":flag="canPause";status="in_progress";break;
            case "continue":flag="canContinue";status="paused";break;
            case "done":flag="canDone";status="in_progress";break;
            default:return false;
        }
        return task.optBoolean(flag)&&status.equals(task.optString("status"));
    }
    static String durationLabel(JSONObject order) {
        String label=order.optString("durationDisplay",order.optString("duration","—"));
        return label+(order.optBoolean("daily")&&order.optInt("dayNumber")>0?" · Day "+order.optInt("dayNumber")+"/"+order.optInt("totalDays"):"");
    }
    static boolean confirmedActiveTake(JSONObject task) {
        if (task == null) return false;
        String status = task.optString("status");
        return ("assigned".equals(status) || "in_progress".equals(status))
                && "sent".equals(task.optString("takeStatus")) && !task.optBoolean("deliveryUncertain")
                && (task.optBoolean("canStart") || task.optBoolean("canDone"))
                && task.optString("orderRef").matches("X[0-9]{2,12}")
                && !task.optString("employeeCode").isEmpty() && !task.optString("employeeId").isEmpty();
    }
    private static boolean base(JSONObject data, int schema) {
        return data != null && data.optInt("schema") == schema && "FH3".equals(data.optString("scope"));
    }
}
