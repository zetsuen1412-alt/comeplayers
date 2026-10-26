package id.comeplayers.boostmonitor;

import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/** User-enabled foreground polling. Android may defer network access while idle. */
public final class OrderNotificationService extends Service {
    private final Handler handler=new Handler(Looper.getMainLooper());
    private PayrollSync api;
    private EmployeeDb db;
    private SharedPreferences settings;
    private boolean stopped,polling;
    private final Runnable poll=new Runnable(){public void run(){
        if(stopped)return;
        if(!settings.getBoolean("order_notifications",false) || !api.hasSession()){stopSelf();return;}
        api.loadPendingOrders((data,message,ok)->{
            if(stopped)return;
            try{
                if(!settings.getBoolean("order_notifications",false) || !api.hasSession()){stopSelf();return;}
                String detail;
                if(ok && data!=null)detail=OrderNotifications.observe(OrderNotificationService.this,data);
                else{detail=message;OrderNotifications.failed(OrderNotificationService.this,message);}
                OrderNotifications.serviceChecked(OrderNotificationService.this,detail);
                getSystemService(NotificationManager.class).notify(8301,
                    OrderNotifications.notification(OrderNotificationService.this,OrderNotifications.BACKGROUND,
                        ok?"Monitor order FH3 aktif":"Monitor belum tersinkron",detail).setOnlyAlertOnce(true).setOngoing(true).build());
            }catch(RuntimeException error){
                OrderNotifications.failed(OrderNotificationService.this,"Notifikasi gagal diproses. Buka Pengaturan dan Tes notifikasi.");
                OrderNotifications.serviceChecked(OrderNotificationService.this,"Notifikasi gagal diproses. Buka Pengaturan dan Tes notifikasi.");
            }finally{
                if(!stopped)handler.postDelayed(this,30000);
            }
        });
    }};
    @Override public void onCreate(){
        super.onCreate();settings=getSharedPreferences("settings",MODE_PRIVATE);
        db=new EmployeeDb(this);api=new PayrollSync(new SecureSession(this),db,this);OrderNotifications.ensureChannels(this);
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(!settings.getBoolean("order_notifications",false) || !api.hasSession()){stopSelf();return START_NOT_STICKY;}
        startForeground(8301,OrderNotifications.notification(this,OrderNotifications.BACKGROUND,"Monitor order FH3 aktif",
            "Menunggu hasil pemeriksaan antrean. Buka Pengaturan untuk status dan tes notifikasi.").setOnlyAlertOnce(true).setOngoing(true).build());
        if(!polling){polling=true;handler.post(poll);}return START_STICKY;
    }
    @Override public void onDestroy(){stopped=true;handler.removeCallbacksAndMessages(null);getSystemService(NotificationManager.class).cancel(OrderNotifications.ORDER_ID);api.shutdown();db.close();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
