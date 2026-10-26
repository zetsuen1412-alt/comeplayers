package id.comeplayers.boostmonitor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;

/** User-enabled foreground monitoring, not dependent on an open Activity. No bot/database secrets. */
public final class OrderNotificationService extends Service {
    private static final String LEGACY_CHANNEL="fh3-new-orders-v1", MUSIC="fh3-new-orders-music-v2",
        SILENT="fh3-new-orders-silent-v2", BACKGROUND="fh3-monitor-running-v1";
    private final Handler handler=new Handler(Looper.getMainLooper());
    private PayrollSync api;
    private EmployeeDb db;
    private SharedPreferences settings, identity;
    private boolean stopped, polling;
    private NewOrderTracker tracker;
    private String account="";
    private final Runnable poll=new Runnable(){public void run(){
        if(stopped)return;
        if(!settings.getBoolean("order_notifications",false) || !api.hasSession()){stopSelf();return;}
        api.loadPendingOrders((data,message,ok)->{
            if(stopped)return;
            if(ok && data!=null) {
                observe(data);
                getSystemService(NotificationManager.class).notify(8301,notification(BACKGROUND,"Monitor order FH3 aktif","Memeriksa order baru. Buka aplikasi untuk mematikan notifikasi.").setOngoing(true).build());
            }
            else getSystemService(NotificationManager.class).notify(8301,notification(BACKGROUND,"Monitor belum tersinkron","Periksa koneksi dan login akun Monitor.").setOngoing(true).build());
            handler.postDelayed(this,30000);
        });
    }};
    @Override public void onCreate(){
        super.onCreate();settings=getSharedPreferences("settings",MODE_PRIVATE);identity=getSharedPreferences("monitor_identity",MODE_PRIVATE);
        db=new EmployeeDb(this);api=new PayrollSync(new SecureSession(this),db,this);
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager manager=getSystemService(NotificationManager.class);
            NotificationChannel legacy=manager.getNotificationChannel(LEGACY_CHANNEL);
            int importance=legacy==null?NotificationManager.IMPORTANCE_HIGH:legacy.getImportance();
            // Channel sounds are immutable. New stable IDs carry the requested
            // music while inheriting a user's previous blocked/low importance.
            NotificationChannel music=new NotificationChannel(MUSIC,"Order baru FH3 · Musik",importance);
            music.setDescription("Cuplikan musik 10 detik untuk order baru dari Adm EVO Gaming.");
            music.setSound(musicUri(),audioAttributes());manager.createNotificationChannel(music);
            NotificationChannel silent=new NotificationChannel(SILENT,"Order baru FH3 · Tanpa suara",importance);
            silent.setDescription("Notifikasi order ketika suara dimatikan dalam aplikasi.");silent.setSound(null,null);manager.createNotificationChannel(silent);
            manager.createNotificationChannel(new NotificationChannel(BACKGROUND,"Monitor order berjalan",NotificationManager.IMPORTANCE_LOW));
        }
    }
    private Uri musicUri(){return Uri.parse("android.resource://"+getPackageName()+"/raw/new_order");}
    private AudioAttributes audioAttributes(){return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        startForeground(8301,notification(BACKGROUND,"Monitor order FH3 aktif","Memeriksa order baru. Buka aplikasi untuk mematikan notifikasi.").setOngoing(true).build());
        if(!polling){polling=true;handler.post(poll);}return START_STICKY;
    }
    private Notification.Builder notification(String channel,String title,String text){
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,channel):new Notification.Builder(this);
        return builder.setSmallIcon(id.comeplayers.boostmonitor.R.drawable.ic_order_notification).setContentTitle(title).setContentText(text)
            .setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE);
    }
    private void observe(JSONObject data){
        String current=identity.getString("accountId","");
        if(current.isEmpty())return;
        if(!account.equals(current)){
            getSystemService(NotificationManager.class).cancel(8302);
            account=current;
            tracker=new NewOrderTracker(settings.contains("seen_orders_"+account)?settings.getStringSet("seen_orders_"+account,null):null);
        }
        JSONArray pending=data.optJSONArray("pending");if(pending==null)return;
        ArrayList<String> refs=new ArrayList<>();for(int i=0;i<pending.length();i++)refs.add(pending.optJSONObject(i).optString("orderRef"));
        java.util.List<String> added=tracker.observe(refs);
        settings.edit().putStringSet("seen_orders_"+account,tracker.snapshot()).apply();
        NotificationManager manager=getSystemService(NotificationManager.class);
        boolean allowed=Build.VERSION.SDK_INT<33 || checkSelfPermission("android.permission.POST_NOTIFICATIONS")==PackageManager.PERMISSION_GRANTED;
        if(added.isEmpty() || !allowed || !manager.areNotificationsEnabled())return;
        boolean sound=settings.getBoolean("order_sound",true);String channel=sound?MUSIC:SILENT;
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel chosen=manager.getNotificationChannel(channel);
            if(chosen==null || chosen.getImportance()==NotificationManager.IMPORTANCE_NONE)return;
        }
        Notification.Builder alert=notification(channel,added.size()+" order FH3 baru",android.text.TextUtils.join(", ",added))
            .setCategory(Notification.CATEGORY_EVENT).setPriority(Notification.PRIORITY_HIGH);
        if(Build.VERSION.SDK_INT<26)alert.setSound(sound?musicUri():null,audioAttributes());
        manager.notify(8302,alert.build());
    }
    @Override public void onDestroy(){stopped=true;handler.removeCallbacksAndMessages(null);getSystemService(NotificationManager.class).cancel(8302);api.shutdown();db.close();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
