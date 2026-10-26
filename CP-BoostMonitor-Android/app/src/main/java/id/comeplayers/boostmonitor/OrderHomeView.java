package id.comeplayers.boostmonitor;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.function.Consumer;

/** Compact read-only queue presentation; TAKE still uses the existing worker confirmation. */
final class OrderHomeView extends LinearLayout {
    private static final int INK=0xff17212b, SUB=0xff687b8b, BLUE=0xff1678b8, BORDER=0xffe5ebef;
    private final JSONArray orders;
    private final boolean blocked;
    private final Consumer<String> take;
    private final LinearLayout cards;
    final EditText search;

    OrderHomeView(Context context, JSONArray orders, boolean loading, boolean loaded, String error,
                  boolean busy, String query, Runnable refresh, Consumer<String> take, Consumer<String> searchChanged) {
        super(context); setOrientation(VERTICAL);
        this.orders=orders==null?new JSONArray():orders;this.take=take;
        blocked=loading||busy||!error.isEmpty();
        LinearLayout title=row();
        title.addView(label("Order Baru",24,INK,true),new LayoutParams(0,-2,1));
        Button update=button(loading?"Memuat…":"Perbarui",false);update.setTag("refresh-orders");
        update.setEnabled(!loading&&!busy);update.setOnClickListener(v->refresh.run());
        title.addView(update,new LayoutParams(dp(104),dp(48)));addView(title);
        TextView summary=label(loaded?this.orders.length()+" order • terbaru lebih dulu":"Memuat order dari Telegram FH3…",13,SUB,false);
        summary.setPadding(0,dp(4),0,dp(12));addView(summary);
        search=new EditText(context);search.setTag("order-search");search.setSingleLine(true);search.setTextSize(14);
        search.setHint("Cari kode, game, Discord, TASK");search.setContentDescription("Cari order");
        search.setTextColor(INK);search.setPadding(dp(12),0,dp(12),0);search.setBackground(surface(0xffedf2f5));
        search.setText(query);addView(search,new LayoutParams(-1,dp(48)));
        if(!error.isEmpty()) {TextView warning=label(error+"\nTekan Perbarui untuk mencoba lagi.",13,0xffa34319,false);warning.setPadding(0,dp(12),0,dp(4));addView(warning);}
        cards=new LinearLayout(context);cards.setOrientation(VERTICAL);addView(cards);
        fill(query,loading,loaded,error);
        search.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){searchChanged.accept(s.toString());fill(s.toString(),loading,loaded,error);}
            public void afterTextChanged(Editable value){}
        });
    }
    private void fill(String query,boolean loading,boolean loaded,String error) {
        cards.removeAllViews();int shown=0;String needle=query.trim().toLowerCase(Locale.ROOT);
        for(int i=0;i<orders.length();i++) {
            JSONObject order=orders.optJSONObject(i);if(order==null||order.optString("orderRef").trim().isEmpty())continue;
            String haystack=(order.optString("orderRef")+" "+order.optString("game")+" "+order.optString("discord")+" "+order.optString("task")).toLowerCase(Locale.ROOT);
            if(!haystack.contains(needle))continue;
            addCard(order);shown++;
        }
        if(shown==0) {
            String message=!needle.isEmpty()?"Order tidak ditemukan.":!error.isEmpty()?"Daftar belum dapat diperbarui.":loading||!loaded?"Memuat order…":"Belum ada order baru.";
            TextView empty=label(message,15,SUB,false);empty.setPadding(dp(4),dp(28),dp(4),dp(28));cards.addView(empty);
        }
    }
    private void addCard(JSONObject order) {
        String ref=order.optString("orderRef");
        LinearLayout card=new LinearLayout(getContext());card.setOrientation(VERTICAL);card.setTag("order:"+ref);
        card.setPadding(dp(14),dp(12),dp(14),dp(12));card.setBackground(surface(Color.WHITE));
        LayoutParams position=new LayoutParams(-1,-2);position.topMargin=dp(12);cards.addView(card,position);
        card.addView(label(ref,18,INK,true));
        card.addView(label(order.optString("game").isEmpty()?"Game belum tercantum":order.optString("game"),14,BLUE,true));
        String discord=order.optString("discord").trim();
        if(!discord.isEmpty())card.addView(label("Discord: "+discord,13,SUB,false));
        TextView task=label(order.optString("task","Lihat detail order"),14,INK,false);task.setMaxLines(2);task.setEllipsize(TextUtils.TruncateAt.END);
        task.setPadding(0,dp(8),0,dp(10));card.addView(task);
        LinearLayout actions=row();
        Button detail=button("Detail",false);detail.setTag("detail:"+ref);
        actions.addView(detail,new LayoutParams(0,dp(48),1));
        Button assign=button("TAKE ORDER",true);assign.setTag("take:"+ref);
        LayoutParams main=new LayoutParams(0,dp(48),2);main.leftMargin=dp(8);actions.addView(assign,main);
        boolean allowed=MonitorContract.canTake(order)&&!blocked;assign.setEnabled(allowed);assign.setAlpha(allowed?1f:0.45f);
        assign.setOnClickListener(v->{if(allowed)take.accept(ref);});
        detail.setOnClickListener(v->new AlertDialog.Builder(getContext()).setTitle(ref)
            .setMessage("Game: "+order.optString("game","—")+"\nDiscord: "+order.optString("discord","—")
                +"\nOrder: "+order.optString("orderName","—")+"\n\nTASK\n"+order.optString("task","—"))
            .setNegativeButton("Tutup",null).setPositiveButton(allowed?"TAKE ORDER":null,allowed?(d,w)->take.accept(ref):null).show());
        card.addView(actions);
    }
    static String selectedTab(String page) {return "Order Baru".equals(page)||"Tugas".equals(page)?page:"Menu";}
    static LinearLayout navigation(Context context,String page,Consumer<String> navigate) {
        LinearLayout nav=new LinearLayout(context);nav.setOrientation(HORIZONTAL);nav.setBackgroundColor(Color.WHITE);nav.setTag("main-navigation");
        String[] routes={"Order Baru","Tugas","Menu"},labels={"Order","Tugas","Menu"};
        int height=Math.round(60*context.getResources().getDisplayMetrics().density);
        for(int i=0;i<routes.length;i++){
            String route=routes[i];TextView tab=new TextView(context);tab.setText(labels[i]);tab.setTextSize(14);
            tab.setGravity(Gravity.CENTER);tab.setTag("nav:"+route);boolean active=selectedTab(page).equals(route);
            tab.setTextColor(active?BLUE:SUB);if(active)tab.setTypeface(null,Typeface.BOLD);tab.setSelected(active);
            tab.setOnClickListener(v->navigate.accept(route));nav.addView(tab,new LayoutParams(0,height,1));
        }
        return nav;
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private LinearLayout row(){LinearLayout row=new LinearLayout(getContext());row.setGravity(Gravity.CENTER_VERTICAL);return row;}
    private TextView label(String value,int size,int color,boolean bold){TextView view=new TextView(getContext());view.setText(value);view.setTextSize(size);view.setTextColor(color);if(bold)view.setTypeface(null,Typeface.BOLD);return view;}
    private GradientDrawable surface(int color){GradientDrawable drawable=new GradientDrawable();drawable.setColor(color);drawable.setCornerRadius(dp(12));drawable.setStroke(dp(1),BORDER);return drawable;}
    private Button button(String title,boolean primary){Button button=new Button(getContext());button.setText(title);button.setAllCaps(false);button.setTextSize(13);button.setTextColor(primary?Color.WHITE:BLUE);button.setPadding(dp(8),0,dp(8),0);button.setMinHeight(dp(48));button.setMinimumHeight(dp(48));button.setBackground(surface(primary?BLUE:Color.WHITE));return button;}
}
