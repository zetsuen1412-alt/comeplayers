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
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Locale;

/** User-enabled foreground monitoring, not dependent on an open Activity. No bot/database secrets. */
public final class OrderNotificationService extends Service {
    private static final String CHANNEL="fh3-new-orders-v1", BACKGROUND="fh3-monitor-running-v1";
    private final Handler handler=new Handler(Looper.getMainLooper());
    private PayrollSync api;
    private EmployeeDb db;
    private SharedPreferences settings, identity;
    private TextToSpeech speech;
    private boolean speechReady, stopped, polling;
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
        speech=new TextToSpeech(this,status->{speechReady=status==TextToSpeech.SUCCESS;if(speechReady){
            int language=speech.setLanguage(new Locale("id","ID"));
            if(language<0)speech.setLanguage(Locale.getDefault());
            speech.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
        }});
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager manager=getSystemService(NotificationManager.class);
            NotificationChannel orders=new NotificationChannel(CHANNEL,"Order baru FH3",NotificationManager.IMPORTANCE_HIGH);
            orders.setDescription("Order baru dari Adm EVO Gaming. Suara dikendalikan dalam aplikasi.");orders.setSound(null,null);manager.createNotificationChannel(orders);
            manager.createNotificationChannel(new NotificationChannel(BACKGROUND,"Monitor order berjalan",NotificationManager.IMPORTANCE_LOW));
        }
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        startForeground(8301,notification(BACKGROUND,"Monitor order FH3 aktif","Memeriksa order baru. Buka aplikasi untuk mematikan notifikasi.").setOngoing(true).build());
        if(!polling){polling=true;handler.post(poll);}return START_STICKY;
    }
    private Notification.Builder notification(String channel,String title,String text){
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,channel):new Notification.Builder(this);
        return builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(text)
            .setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE);
    }
    private void observe(JSONObject data){
        String current=identity.getString("accountId","");
        if(current.isEmpty())return;
        if(!account.equals(current)){
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
        if(Build.VERSION.SDK_INT>=26 && manager.getNotificationChannel(CHANNEL).getImportance()==NotificationManager.IMPORTANCE_NONE)return;
        manager.notify(8302,notification(CHANNEL,added.size()+" order FH3 baru",android.text.TextUtils.join(", ",added)).build());
        if(settings.getBoolean("order_sound",true)){
            if(speechReady){Bundle params=new Bundle();params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM,AudioManager.STREAM_NOTIFICATION);
                speech.speak("SAYA AKAN LAWAN!!",TextToSpeech.QUEUE_FLUSH,params,"fh3-new-order");}
            else {final ToneGenerator tone=new ToneGenerator(AudioManager.STREAM_NOTIFICATION,80);tone.startTone(ToneGenerator.TONE_PROP_BEEP2,400);handler.postDelayed(tone::release,600);}
        }
    }
    @Override public void onDestroy(){stopped=true;handler.removeCallbacksAndMessages(null);if(speech!=null){speech.stop();speech.shutdown();}api.shutdown();db.close();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
