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
    private static boolean base(JSONObject data, int schema) {
        return data != null && data.optInt("schema") == schema && "FH3".equals(data.optString("scope"));
    }
}
