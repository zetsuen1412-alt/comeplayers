package id.comeplayers.boostmonitor;

import android.content.Context;
import android.view.View;
import android.widget.Button;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;
import org.robolectric.util.ReflectionHelpers;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public final class OpenWorkspaceTest {
    private static final class Reply extends HttpURLConnection {
        final ByteArrayOutputStream sent=new ByteArrayOutputStream();
        Reply(URL target){super(target);}
        String path(){return url.getPath();}
        public void disconnect(){} public boolean usingProxy(){return false;} public void connect(){}
        @Override public int getResponseCode(){return 200;}
        @Override public OutputStream getOutputStream(){return sent;}
        @Override public InputStream getInputStream(){
            String path=url.getPath();
            String body=path.endsWith("/pending")?"{\"schema\":2,\"scope\":\"FH3\",\"sourceOfTruth\":\"telegram_fh3_manual\",\"pending\":[]}":"{\"ok\":true,\"assigned\":true,\"takeSent\":true}";
            return new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8));
        }
    }
    private static void drain(PayrollSync api)throws Exception{
        ((ExecutorService)ReflectionHelpers.getField(api,"executor")).submit(()->{}).get(3,TimeUnit.SECONDS);
        ((ExecutorService)ReflectionHelpers.getField(api,"actions")).submit(()->{}).get(3,TimeUnit.SECONDS);
        ShadowLooper.idleMainLooper();
    }
    @Test public void newInstallShowsOrdersAndOnlySettingsOffersAdminLogin(){
        Context c=RuntimeEnvironment.getApplication();
        c.getSharedPreferences("payroll_session_secure",Context.MODE_PRIVATE).edit().clear().commit();
        c.getSharedPreferences("monitor_identity",Context.MODE_PRIVATE).edit().clear().commit();
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()){
            MainActivity main=controller.get();
            assertNotNull(main.getWindow().getDecorView().findViewWithTag("order-search"));
            assertTrue(c.getSharedPreferences("settings",Context.MODE_PRIVATE).getBoolean("order_notifications",false));
            assertFalse(c.getSharedPreferences("monitor_identity",Context.MODE_PRIVATE).getBoolean("isAdmin",false));
            ReflectionHelpers.setField(main,"page","Pengaturan");ReflectionHelpers.callInstanceMethod(main,"render");
            Button login=main.getWindow().getDecorView().findViewWithTag("login-admin");
            assertNotNull(login);assertEquals("Login Admin",login.getText());
            ReflectionHelpers.setField(main,"page","Order Baru");ReflectionHelpers.callInstanceMethod(main,"render");
            assertNotNull(main.getWindow().getDecorView().findViewWithTag("order-search"));
        }
    }
    @Test public void oldLoginPresenceNeverCausesWorkerAuthenticationOrTokenRefresh()throws Exception{
        Context c=RuntimeEnvironment.getApplication();
        c.getSharedPreferences("payroll_session_secure",Context.MODE_PRIVATE).edit().putString("session","old-encrypted-presence").commit();
        c.getSharedPreferences("monitor_identity",Context.MODE_PRIVATE).edit().putBoolean("isAdmin",true).putBoolean("admin_session",true).commit();
        List<Reply> calls=Collections.synchronizedList(new ArrayList<>());
        EmployeeDb db=new EmployeeDb(c);
        PayrollSync api=new PayrollSync(new SecureSession(c),db,c,false,url->{Reply r=new Reply(url);calls.add(r);return r;});
        try{
            AtomicBoolean success=new AtomicBoolean();
            api.loadPendingOrders((data,message,ok)->success.set(ok));drain(api);
            assertTrue(success.get());assertFalse(api.hasAdminSession());assertEquals(1,calls.size());
            assertTrue(calls.get(0).path().endsWith("/pending"));
            assertNull(calls.get(0).getRequestProperty("Authorization"));assertEquals("public",calls.get(0).getRequestProperty("X-Monitor-Mode"));
            assertEquals("old-encrypted-presence",c.getSharedPreferences("payroll_session_secure",Context.MODE_PRIVATE).getString("session",""));
            assertFalse(c.getSharedPreferences("monitor_identity",Context.MODE_PRIVATE).getBoolean("isAdmin",true));
        }finally{api.shutdown();db.close();}
    }
    @Test public void takingAnOrderUsesOnePublicPostAndNoAccountSession()throws Exception{
        Context c=RuntimeEnvironment.getApplication();List<Reply> calls=Collections.synchronizedList(new ArrayList<>());
        EmployeeDb db=new EmployeeDb(c);PayrollSync api=new PayrollSync(new SecureSession(c),db,c,false,url->{Reply r=new Reply(url);calls.add(r);return r;});
        try{
            AtomicBoolean success=new AtomicBoolean();api.assignOrder("X800","E1",(data,message,ok)->success.set(ok));drain(api);
            assertTrue(success.get());assertEquals(1,calls.size());assertEquals("POST",calls.get(0).getRequestMethod());
            assertNull(calls.get(0).getRequestProperty("Authorization"));assertEquals("public",calls.get(0).getRequestProperty("X-Monitor-Mode"));
            assertTrue(new String(calls.get(0).sent.toByteArray(),StandardCharsets.UTF_8).contains("X800"));
        }finally{api.shutdown();db.close();}
    }
    @Test public void backgroundMonitorCompletesItsPollWithNoAccountStored()throws Exception{
        android.app.Application c=RuntimeEnvironment.getApplication();
        c.getSharedPreferences("payroll_session_secure",Context.MODE_PRIVATE).edit().clear().commit();
        c.getSharedPreferences("settings",Context.MODE_PRIVATE).edit().clear().putBoolean("order_notifications",true).commit();
        Shadows.shadowOf(c).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        var controller=Robolectric.buildService(OrderNotificationService.class).create();
        var service=controller.get();
        PayrollSync old=ReflectionHelpers.getField(service,"api");old.shutdown();
        EmployeeDb db=ReflectionHelpers.getField(service,"db");List<Reply> calls=new ArrayList<>();
        PayrollSync api=new PayrollSync(new SecureSession(c),db,c,true,url->{Reply r=new Reply(url);calls.add(r);return r;});
        ReflectionHelpers.setField(service,"api",api);
        try{
            assertFalse(api.hasSession());
            ((Runnable)ReflectionHelpers.getField(service,"poll")).run();drain(api);
            assertEquals(1,calls.size());assertEquals("public",calls.get(0).getRequestProperty("X-Monitor-Mode"));
            assertTrue(c.getSharedPreferences("settings",Context.MODE_PRIVATE).getLong("notification_service_check",0)>0);
            assertNotNull(Shadows.shadowOf(c.getSystemService(android.app.NotificationManager.class)).getNotification(8301));
        }finally{controller.destroy();}
    }
}
