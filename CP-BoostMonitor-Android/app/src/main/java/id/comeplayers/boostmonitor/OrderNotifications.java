package id.comeplayers.boostmonitor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** One delivery path for foreground and service polling. Never changes system sound settings. */
final class OrderNotifications {
    static final String MUSIC="fh3-new-orders-music-v2", SILENT="fh3-new-orders-silent-v2",
        BACKGROUND="fh3-monitor-running-v1", LEGACY="fh3-new-orders-v1";
    static final int ORDER_ID=8302, TEST_ID=8303;
    private static final Object DELIVERY_LOCK=new Object();
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences("settings",Context.MODE_PRIVATE);}
    static Uri musicUri(Context c){return Uri.parse("android.resource://"+c.getPackageName()+"/raw/new_order");}
    private static AudioAttributes audio(){return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();}

    static void ensureChannels(Context c){
        if(Build.VERSION.SDK_INT<26)return;
        NotificationManager manager=c.getSystemService(NotificationManager.class);
        NotificationChannel legacy=manager.getNotificationChannel(LEGACY);
        int importance=legacy==null?NotificationManager.IMPORTANCE_HIGH:legacy.getImportance();
        NotificationChannel music=new NotificationChannel(MUSIC,"Order baru FH3 · Musik",importance);
        music.setDescription("Cuplikan musik 10 detik untuk order baru dari Adm EVO Gaming.");
        music.setSound(musicUri(c),audio());manager.createNotificationChannel(music);
        NotificationChannel silent=new NotificationChannel(SILENT,"Order baru FH3 · Tanpa suara",importance);
        silent.setSound(null,null);manager.createNotificationChannel(silent);
        manager.createNotificationChannel(new NotificationChannel(BACKGROUND,"Monitor order berjalan",NotificationManager.IMPORTANCE_LOW));
    }
    static String selectedChannel(Context c){return prefs(c).getBoolean("order_sound",true)?MUSIC:SILENT;}
    static Notification.Builder notification(Context c,String channel,String title,String text){
        PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder result=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,channel):new Notification.Builder(c);
        return result.setSmallIcon(R.drawable.ic_order_notification).setContentTitle(title).setContentText(text)
            .setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE);
    }
    private static Notification.Builder alert(Context c,String title,String text){
        Notification.Builder result=notification(c,selectedChannel(c),title,text)
            .setCategory(Notification.CATEGORY_EVENT).setPriority(Notification.PRIORITY_HIGH);
        if(Build.VERSION.SDK_INT<26)result.setSound(prefs(c).getBoolean("order_sound",true)?musicUri(c):null,audio());
        return result;
    }
    static String blockedReason(Context c){
        if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)
            return "Izin notifikasi Android belum diberikan. Buka Izin & banner notifikasi.";
        NotificationManager manager=c.getSystemService(NotificationManager.class);
        if(!manager.areNotificationsEnabled())return "Notifikasi aplikasi diblokir Android. Buka Izin & banner notifikasi.";
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel channel=manager.getNotificationChannel(selectedChannel(c));
            if(channel==null || channel.getImportance()==NotificationManager.IMPORTANCE_NONE)
                return "Kategori Order baru FH3 diblokir. Aktifkan di Izin & banner notifikasi.";
        }
        return "";
    }
    static void failed(Context c,String message){status(c,message,false);}
    static void serviceChecked(Context c,String message){
        prefs(c).edit().putLong("notification_service_check",System.currentTimeMillis()).putString("notification_service_status",message).apply();
    }
    private static String status(Context c,String message,boolean ok){
        prefs(c).edit().putLong("notification_last_check",System.currentTimeMillis())
            .putString("notification_status",message).putBoolean("notification_check_ok",ok).apply();
        return message;
    }
    static String observe(Context c,JSONObject data){
        synchronized(DELIVERY_LOCK){
            SharedPreferences settings=prefs(c);
            if(!settings.getBoolean("order_notifications",false))return "Pemantauan dimatikan.";
            if(!MonitorContract.pending(data))throw new IllegalArgumentException("Daftar order tidak valid.");
            String account=c.getSharedPreferences("monitor_identity",Context.MODE_PRIVATE).getString("accountId","");
            if(account.isEmpty())return status(c,"Identitas akun belum tersedia. Sinkronkan Nama Sekarang atau login ulang.",false);
            JSONArray pending=data.optJSONArray("pending");
            List<String> refs=new ArrayList<>();
            for(int i=0;i<pending.length();i++){
                JSONObject item=pending.optJSONObject(i);if(item==null)continue;
                String ref=item.optString("orderRef").trim().toUpperCase(Locale.ROOT);
                if(!ref.isEmpty())refs.add(ref);
            }
            String key="seen_orders_"+account;
            NewOrderTracker tracker=new NewOrderTracker(settings.contains(key)?settings.getStringSet(key,null):null);
            List<String> added=tracker.observe(refs);
            if(added.isEmpty()){
                settings.edit().putStringSet(key,tracker.snapshot()).apply();
                return status(c,"Antrean terbaca: "+refs.size()+" order. Menunggu order baru.",true);
            }
            ensureChannels(c);
            String blocked=blockedReason(c);
            // Keep these references eligible for retry after permission/channel recovery.
            if(!blocked.isEmpty())return status(c,blocked,false);
            c.getSystemService(NotificationManager.class).notify(ORDER_ID,
                alert(c,added.size()+" order FH3 baru",android.text.TextUtils.join(", ",added)).build());
            settings.edit().putStringSet(key,tracker.snapshot()).putLong("notification_last_sent",System.currentTimeMillis()).apply();
            return status(c,added.size()+" order baru dikirim ke notifikasi Android.",true);
        }
    }
    /** Deliberate local test: no session, queue, tracking history or Telegram actions. */
    static String test(Context c){
        ensureChannels(c);String blocked=blockedReason(c);if(!blocked.isEmpty())return blocked;
        Notification.Builder test=alert(c,"TES · Notifikasi order FH3","Contoh lokal. Tidak membuat atau mengambil order, dan tidak mengirim Telegram.");
        if(Build.VERSION.SDK_INT>=26)test.setTimeoutAfter(10000);
        c.getSystemService(NotificationManager.class).notify(TEST_ID,test.build());
        return "Tes dikirim. Periksa panel notifikasi dan suara HP. Jika hanya terlihat di panel, aktifkan banner pada kategori Order baru FH3.";
    }
    static String diagnostics(Context c){
        ensureChannels(c);SharedPreferences settings=prefs(c);
        StringBuilder text=new StringBuilder();
        try{text.append("Versi ").append(c.getPackageManager().getPackageInfo(c.getPackageName(),0).versionName).append(" • Android ").append(Build.VERSION.RELEASE).append('\n');}catch(PackageManager.NameNotFoundException ignored){}
        text.append(settings.getBoolean("order_notifications",false)?"Pemantauan diaktifkan.":"Pemantauan dimatikan di aplikasi.");
        String blocked=blockedReason(c);if(!blocked.isEmpty())text.append('\n').append(blocked);
        else if(Build.VERSION.SDK_INT>=26){
            NotificationChannel channel=c.getSystemService(NotificationManager.class).getNotificationChannel(selectedChannel(c));
            if(channel.getImportance()<NotificationManager.IMPORTANCE_HIGH)text.append("\nBanner tidak aktif: pilih prioritas tinggi / tampil di layar pada kategori Order baru FH3.");
            if(settings.getBoolean("order_sound",true) && channel.getSound()==null)text.append("\nSuara kategori dimatikan di Android. Pilih suara pada kategori Order baru FH3 · Musik.");
        }
        AudioManager audio=c.getSystemService(AudioManager.class);
        if(!settings.getBoolean("order_sound",true))text.append("\nSuara dimatikan di aplikasi.");
        else if(audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION)==0 || audio.getRingerMode()!=AudioManager.RINGER_MODE_NORMAL)
            text.append("\nVolume notifikasi nol atau HP dalam mode senyap/getar.");
        if(c.getSystemService(NotificationManager.class).getCurrentInterruptionFilter()!=NotificationManager.INTERRUPTION_FILTER_ALL)
            text.append("\nMode Jangan Ganggu dapat membisukan notifikasi.");
        long last=settings.getLong("notification_last_check",0);
        if(last==0)text.append("\nAntrean belum diperiksa oleh pemantau.");
        else text.append("\nPemeriksaan terakhir ").append(Math.max(0,(System.currentTimeMillis()-last)/1000)).append(" detik lalu: ").append(settings.getString("notification_status",""));
        long background=settings.getLong("notification_service_check",0);
        if(background==0)text.append("\nLayanan latar belakang belum mengembalikan hasil pemeriksaan.");
        else text.append("\nLatar belakang terakhir ").append(Math.max(0,(System.currentTimeMillis()-background)/1000)).append(" detik lalu: ").append(settings.getString("notification_service_status",""));
        PowerManager power=c.getSystemService(PowerManager.class);
        if(!power.isIgnoringBatteryOptimizations(c.getPackageName()))text.append("\nPenghemat baterai dapat menunda pemeriksaan ketika layar mati. Izinkan aktivitas latar belakang di pengaturan baterai aplikasi.");
        return text.toString();
    }
}
