package id.comeplayers.boostmonitor;

import android.Manifest;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import static org.junit.Assert.*;

/** Android 15 framework integration; synthetic queues, no login/network or audible playback. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public final class OrderNotificationsTest {
    private Application app;
    private SharedPreferences settings,identity;
    private NotificationManager manager;
    @Before public void setup(){
        app=RuntimeEnvironment.getApplication();settings=app.getSharedPreferences("settings",Context.MODE_PRIVATE);
        identity=app.getSharedPreferences("monitor_identity",Context.MODE_PRIVATE);
        settings.edit().clear().putBoolean("order_notifications",true).commit();
        identity.edit().clear().putString("accountId","synthetic-a").commit();
        manager=app.getSystemService(NotificationManager.class);manager.cancelAll();
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
    }
    private JSONObject queue(String... refs)throws Exception{
        JSONArray orders=new JSONArray();for(String ref:refs)orders.put(new JSONObject().put("orderRef",ref));
        return new JSONObject().put("schema",2).put("scope","FH3").put("sourceOfTruth","telegram_fh3_manual").put("pending",orders);
    }
    private Notification delivered(){return Shadows.shadowOf(manager).getNotification(OrderNotifications.ORDER_ID);}

    @Test public void newOrderPostsOnAndroid15AndBothCallersDeduplicate()throws Exception{
        OrderNotifications.observe(app,queue("X100"));assertNull(delivered());
        OrderNotifications.observe(app,queue("X100","X101"));
        Notification posted=delivered();assertNotNull(posted);
        assertEquals(OrderNotifications.MUSIC,posted.getChannelId());
        assertEquals("X101",posted.extras.getString(Notification.EXTRA_TEXT));
        assertNotNull(posted.contentIntent);assertNotNull(posted.getSmallIcon());
        manager.cancel(OrderNotifications.ORDER_ID);
        OrderNotifications.observe(app,queue("X100","X101"));assertNull(delivered());
    }
    @Test public void deniedPermissionDoesNotConsumeNewOrderAndRecoveryRetries()throws Exception{
        OrderNotifications.observe(app,queue("X100"));
        Shadows.shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
        OrderNotifications.observe(app,queue("X100","X101"));assertNull(delivered());
        assertFalse(settings.getStringSet("seen_orders_synthetic-a",null).contains("X101"));
        assertFalse(settings.getBoolean("notification_check_ok",true));
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        OrderNotifications.observe(app,queue("X100","X101"));assertNotNull(delivered());
    }
    @Test public void blockedChannelDoesNotConsumeNewOrder()throws Exception{
        manager.createNotificationChannel(new NotificationChannel(OrderNotifications.MUSIC,"Blocked",NotificationManager.IMPORTANCE_NONE));
        OrderNotifications.observe(app,queue("X100"));OrderNotifications.observe(app,queue("X101"));
        assertNull(delivered());assertFalse(settings.getStringSet("seen_orders_synthetic-a",null).contains("X101"));
        assertTrue(OrderNotifications.diagnostics(app).contains("diblokir"));
    }
    @Test public void silentPreferenceStillPostsVisualNotification()throws Exception{
        settings.edit().putBoolean("order_sound",false).commit();
        OrderNotifications.observe(app,queue("X100"));OrderNotifications.observe(app,queue("X101"));
        assertNotNull(delivered());assertEquals(OrderNotifications.SILENT,delivered().getChannelId());
        assertNull(manager.getNotificationChannel(OrderNotifications.SILENT).getSound());
    }
    @Test public void testUsesRealChannelWithoutTouchingQueueOrConsent()throws Exception{
        settings.edit().putBoolean("order_notifications",false).commit();
        HashMap<String,Object> before=new HashMap<>(settings.getAll());
        OrderNotifications.test(app);
        Notification test=Shadows.shadowOf(manager).getNotification(OrderNotifications.TEST_ID);
        assertNotNull(test);assertEquals(OrderNotifications.MUSIC,test.getChannelId());
        assertTrue(test.extras.getString(Notification.EXTRA_TITLE).startsWith("TES"));
        assertEquals(before,settings.getAll());assertNull(delivered());
    }
    @Test public void channelSettingsAndLegacyBlockRemainEffective(){
        NotificationChannel music=new NotificationChannel(OrderNotifications.MUSIC,"Custom",NotificationManager.IMPORTANCE_LOW);
        music.setSound(null,null);manager.createNotificationChannel(music);OrderNotifications.ensureChannels(app);
        assertEquals(NotificationManager.IMPORTANCE_LOW,manager.getNotificationChannel(OrderNotifications.MUSIC).getImportance());
        assertNull(manager.getNotificationChannel(OrderNotifications.MUSIC).getSound());
        assertTrue(OrderNotifications.diagnostics(app).contains("Banner tidak aktif"));
    }
    @Test public void oldBlockedChannelIsInherited(){
        manager.createNotificationChannel(new NotificationChannel(OrderNotifications.LEGACY,"Old",NotificationManager.IMPORTANCE_NONE));
        OrderNotifications.ensureChannels(app);
        assertEquals(NotificationManager.IMPORTANCE_NONE,manager.getNotificationChannel(OrderNotifications.MUSIC).getImportance());
    }
    @Test public void musicUriResolvesExactBundledClip()throws Exception{
        OrderNotifications.ensureChannels(app);
        assertEquals(OrderNotifications.musicUri(app),manager.getNotificationChannel(OrderNotifications.MUSIC).getSound());
        MessageDigest sha=MessageDigest.getInstance("SHA-256");
        try(InputStream in=app.getContentResolver().openInputStream(OrderNotifications.musicUri(app))){
            assertNotNull(in);byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)sha.update(buffer,0,n);
        }
        StringBuilder hash=new StringBuilder();for(byte value:sha.digest())hash.append(String.format("%02x",value&255));
        assertEquals("27769d419a110ae112b1b01879ef29df48373c7cf4b65a52881b8933a20ea904",hash.toString());
    }
    @Test public void accountSwitchUsesIndependentSilentBaseline()throws Exception{
        OrderNotifications.observe(app,queue("X100"));
        identity.edit().putString("accountId","synthetic-b").commit();
        OrderNotifications.observe(app,queue("X101"));assertNull(delivered());
        OrderNotifications.observe(app,queue("X102"));assertNotNull(delivered());
        assertEquals(1,settings.getStringSet("seen_orders_synthetic-a",null).size());
    }
    @Test public void optOutAndInvalidPayloadNeverPostOrCreateSeenState()throws Exception{
        settings.edit().putBoolean("order_notifications",false).commit();OrderNotifications.observe(app,queue("X100"));
        assertFalse(settings.contains("seen_orders_synthetic-a"));
        settings.edit().putBoolean("order_notifications",true).commit();
        assertThrows(IllegalArgumentException.class,()->OrderNotifications.observe(app,new JSONObject()));
        assertFalse(settings.contains("seen_orders_synthetic-a"));assertNull(delivered());
    }
    @Test public void missingIdentityIsVisibleInsteadOfSilentlyDiscarded()throws Exception{
        identity.edit().clear().commit();OrderNotifications.observe(app,queue("X100"));
        assertTrue(OrderNotifications.diagnostics(app).contains("Identitas akun belum tersedia"));assertNull(delivered());
    }
}
