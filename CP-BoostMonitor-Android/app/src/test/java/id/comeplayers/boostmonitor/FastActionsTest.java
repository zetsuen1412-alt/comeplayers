package id.comeplayers.boostmonitor;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;
import org.robolectric.util.ReflectionHelpers;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public final class FastActionsTest {
    public static final class PhotoProvider extends android.content.ContentProvider {
        public boolean onCreate(){return true;}
        public String getType(android.net.Uri uri){return "image/png";}
        public android.database.Cursor query(android.net.Uri u,String[] p,String s,String[] a,String o){return null;}
        public android.net.Uri insert(android.net.Uri u,android.content.ContentValues v){return null;}
        public int delete(android.net.Uri u,String s,String[] a){return 0;}
        public int update(android.net.Uri u,android.content.ContentValues v,String s,String[] a){return 0;}
    }
    private static HttpURLConnection reply(URL url,String body,CountDownLatch entered,CountDownLatch release) {
        return new HttpURLConnection(url) {
            public void disconnect(){} public boolean usingProxy(){return false;} public void connect(){}
            public OutputStream getOutputStream(){return new ByteArrayOutputStream();}
            public int getResponseCode() throws IOException {
                if(entered!=null)entered.countDown();
                if(release!=null)try { if(!release.await(5,TimeUnit.SECONDS))throw new IOException("Test read timed out"); }
                catch(InterruptedException e){Thread.currentThread().interrupt();throw new IOException(e);}
                return 200;
            }
            public InputStream getInputStream(){return new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8));}
        };
    }
    private static Button button(View view,String text) {
        if(view instanceof Button && ((Button)view).getText().toString().contains(text))return (Button)view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){
            Button found=button(((ViewGroup)view).getChildAt(i),text);if(found!=null)return found;
        }
        return null;
    }
    @Test public void headerRefreshReadsCurrentPageAndEmployeeShortcutWorksDuringThatRead() throws Exception {
        for(String page:new String[]{"Order Baru","Tugas"}) {
            try(var controller=Robolectric.buildActivity(MainActivity.class).create()) {
                MainActivity main=controller.get();
                ((PayrollSync)ReflectionHelpers.getField(main,"payroll")).shutdown();
                CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
                java.util.concurrent.BlockingQueue<String> paths=new LinkedBlockingQueue<>();
                String body="Order Baru".equals(page)
                    ? "{\"schema\":2,\"scope\":\"FH3\",\"sourceOfTruth\":\"telegram_fh3_manual\",\"pending\":[]}"
                    : "{\"schema\":1,\"workflowSchema\":1,\"scope\":\"FH3\",\"sourceOfTruth\":\"telegram_fh3_manual\",\"tasks\":[]}";
                PayrollSync api=new PayrollSync(new SecureSession(main),ReflectionHelpers.getField(main,"db"),main,false,url->{
                    paths.add(url.getPath());return reply(url,body,entered,release);
                });
                ReflectionHelpers.setField(main,"payroll",api);
                ReflectionHelpers.setField(main,"page",page);
                ReflectionHelpers.setField(main,"orderSearch","aion");
                ReflectionHelpers.callInstanceMethod(main,"render");
                try {
                    Button refresh=main.getWindow().getDecorView().findViewWithTag("workspace-refresh");
                    assertEquals("Perbarui",refresh.getText().toString());refresh.performClick();
                    assertTrue(entered.await(2,TimeUnit.SECONDS));
                    assertEquals("/api/admin/payroll/mobile/"+("Order Baru".equals(page)?"pending":"tasks"),paths.poll());
                    View root=main.getWindow().getDecorView();
                    assertFalse(((Button)root.findViewWithTag("workspace-refresh")).isEnabled());
                    Button employees=root.findViewWithTag("employee-shortcut");assertTrue(employees.isEnabled());employees.performClick();
                    assertEquals("Karyawan",ReflectionHelpers.getField(main,"page"));
                    assertTrue(root.findViewWithTag("nav:Menu").isSelected());assertTrue(paths.isEmpty());
                    assertEquals("aion",ReflectionHelpers.getField(main,"orderSearch"));
                } finally {
                    release.countDown();
                    ((ExecutorService)ReflectionHelpers.getField(api,"executor")).submit(()->{}).get(3,TimeUnit.SECONDS);
                    ShadowLooper.idleMainLooper();
                }
                main.onBackPressed();
                assertEquals("Order Baru",ReflectionHelpers.getField(main,"page"));
                assertEquals("aion",((android.widget.EditText)main.getWindow().getDecorView().findViewWithTag("order-search")).getText().toString());
            }
        }
    }
    @Test public void takeAndArchiveReachServerWhilePendingGetIsBlocked() throws Exception {
        Context c=RuntimeEnvironment.getApplication();EmployeeDb db=new EmployeeDb(c);
        CountDownLatch reading=new CountDownLatch(1),release=new CountDownLatch(1),writes=new CountDownLatch(2);
        AtomicInteger posts=new AtomicInteger();
        PayrollSync api=new PayrollSync(new SecureSession(c),db,c,false,url->{
            if(url.getPath().endsWith("/pending"))return reply(url,"{\"schema\":2,\"scope\":\"FH3\",\"sourceOfTruth\":\"telegram_fh3_manual\",\"pending\":[]}",reading,release);
            posts.incrementAndGet();writes.countDown();
            return reply(url,"{\"ok\":true,\"takeSent\":true}",null,null);
        });
        try {
            api.loadPendingOrders((data,message,ok)->{});assertTrue(reading.await(2,TimeUnit.SECONDS));
            api.assignOrder("X800","E1",(data,message,ok)->{});
            api.request("POST","/management",new JSONObject().put("action","archive"),(data,message,ok)->{});
            assertTrue("Writes must bypass a blocked poll",writes.await(2,TimeUnit.SECONDS));
            assertEquals(1,release.getCount());assertEquals(2,posts.get());
        } finally {release.countDown();api.shutdown();db.close();}
    }
    @Test public void activeTaskStartRemainsClickableDuringPollingAndOldReadCannotRestoreActions() throws Exception {
        try(var controller=Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity main=controller.get();PayrollSync previous=ReflectionHelpers.getField(main,"payroll");previous.shutdown();
            EmployeeDb db=ReflectionHelpers.getField(main,"db");
            CountDownLatch reading=new CountDownLatch(1),release=new CountDownLatch(1);
            JSONObject row=new JSONObject().put("orderRef","X800").put("employeeCode","E1").put("employeeId","e1")
                .put("employeeName","Adit").put("status","assigned").put("canStart",true).put("canDone",false);
            String body=new JSONObject().put("schema",1).put("workflowSchema",1).put("scope","FH3")
                .put("sourceOfTruth","telegram_fh3_manual").put("revision",1).put("tasks",new JSONArray().put(row)).toString();
            PayrollSync api=new PayrollSync(new SecureSession(main),db,main,false,url->reply(url,body,reading,release));
            ReflectionHelpers.setField(main,"payroll",api);
            ReflectionHelpers.setField(main,"page","Tugas");
            ReflectionHelpers.setField(main,"activeTasks",new JSONArray().put(row));
            try {
                ReflectionHelpers.callInstanceMethod(main,"loadActiveTasks",ReflectionHelpers.ClassParameter.from(boolean.class,false));
                assertTrue(reading.await(2,TimeUnit.SECONDS));ReflectionHelpers.callInstanceMethod(main,"render");
                Button start=button(main.getWindow().getDecorView(),"START");assertNotNull(start);assertTrue(start.isEnabled());
                // Simulate the write completing while this old GET was in flight.
                ReflectionHelpers.setField(main,"actionVersion",2L);
                ReflectionHelpers.setField(main,"tasksRetryAt",Long.MAX_VALUE);
                row.put("canStart",false);
                release.countDown();
                ((ExecutorService)ReflectionHelpers.getField(api,"executor")).submit(()->{}).get(3,TimeUnit.SECONDS);
                ShadowLooper.idleMainLooper();
                JSONArray tasks=ReflectionHelpers.getField(main,"activeTasks");
                assertFalse("Old GET must not restore the previous action phase",tasks.getJSONObject(0).optBoolean("canStart"));
                assertFalse((Boolean)ReflectionHelpers.getField(main,"tasksBusy"));
            } finally {release.countDown();}
        }
    }
    @Test public void allPhotoActionsUseTheWriteLaneOnceWithoutWaitingForPolling() throws Exception {
        Context c=RuntimeEnvironment.getApplication();EmployeeDb db=new EmployeeDb(c);
        CountDownLatch reading=new CountDownLatch(1),release=new CountDownLatch(1);
        AtomicInteger posts=new AtomicInteger();
        PayrollSync api=new PayrollSync(new SecureSession(c),db,c,false,url->{
            if(url.getPath().endsWith("/pending"))return reply(url,"{}",reading,release);
            assertTrue(url.getPath().endsWith("/progress"));posts.incrementAndGet();
            return reply(url,"{\"ok\":true,\"caption\":\"x800/adit/start\"}",null,null);
        });
        var provider=Robolectric.buildContentProvider(PhotoProvider.class).create().get();
        org.robolectric.shadows.ShadowContentResolver.registerProviderInternal("proof-test",provider);
        var uri=android.net.Uri.parse("content://proof-test/photo.png");
        try {
            api.loadPendingOrders((data,message,ok)->{});assertTrue(reading.await(2,TimeUnit.SECONDS));
            for(String action:new String[]{"start","pause","continue","done"}) {
                org.robolectric.Shadows.shadowOf(c.getContentResolver()).registerInputStream(uri,new ByteArrayInputStream(new byte[32]));
                java.util.concurrent.atomic.AtomicBoolean success=new java.util.concurrent.atomic.AtomicBoolean();
                api.sendProof("X800","E1",action,uri,c.getContentResolver(),"a12d987a-759a-431e-a0c3-3af99ea34180",1,null,(message,ok)->success.set(ok));
                ((ExecutorService)ReflectionHelpers.getField(api,"actions")).submit(()->{}).get(2,TimeUnit.SECONDS);
                ShadowLooper.idleMainLooper();assertTrue(action,success.get());
            }
            assertEquals(4,posts.get());assertEquals(1,release.getCount());
        } finally {release.countDown();api.shutdown();db.close();}
    }
}
