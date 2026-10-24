package id.comeplayers.boostmonitor;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.text.InputType;
import android.widget.*;
import org.json.*;
import java.util.*;

/** Native admin UI; every read/write is authorized again by the server. */
public final class MonitorAdminActivity extends Activity {
    private PayrollSync api;
    private EmployeeDb db;
    private LinearLayout list;
    private TextView status;
    private JSONArray workers=new JSONArray();
    private JSONObject snapshot;
    private boolean busy,destroyed;
    private int dp(int value){return (int)(getResources().getDisplayMetrics().density*value);}
    private LinearLayout column(){LinearLayout p=new LinearLayout(this);p.setOrientation(LinearLayout.VERTICAL);p.setPadding(dp(12),dp(8),dp(12),dp(8));return p;}
    private TextView label(String value){TextView t=new TextView(this);t.setText(value);t.setTextSize(15);t.setTextColor(0xff172d3d);t.setPadding(0,dp(8),0,dp(8));return t;}
    private Button button(String value){Button b=new Button(this);b.setText(value);b.setAllCaps(false);return b;}
    private EditText input(String hint){EditText e=new EditText(this);e.setSingleLine(true);e.setHint(hint);return e;}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);db=new EmployeeDb(this);api=new PayrollSync(new SecureSession(this),db,this);
        ScrollView scroll=new ScrollView(this);LinearLayout root=column();scroll.addView(root);setContentView(scroll);
        root.setBackgroundColor(0xffeaf0f4);root.addView(label("Kelola Order • Admin FH3"));
        status=label("Memeriksa akses...");root.addView(status);
        Button refresh=button("Perbarui order"),accounts=button("Akun Karyawan"),close=button("Tutup Buku");
        root.addView(refresh);root.addView(accounts);root.addView(close);list=column();root.addView(list);
        refresh.setOnClickListener(v->load());accounts.setOnClickListener(v->accounts());close.setOnClickListener(v->closeBook());
        api.request("GET","/roster",null,(data,message,ok)->{
            if(destroyed)return;
            if(!ok || !data.optBoolean("isAdmin")){status.setText("Akses khusus admin. "+message);refresh.setEnabled(false);accounts.setEnabled(false);close.setEnabled(false);return;}
            workers=data.optJSONArray("employees");load();
        });
    }
    @Override public void onDestroy(){destroyed=true;api.shutdown();db.close();super.onDestroy();}
    private void load(){if(busy)return;busy=true;status.setText("Memuat...");api.request("GET","/management",null,(data,message,ok)->{
        if(destroyed)return;busy=false;if(!ok){status.setText(message);return;}snapshot=data;render();
    });}
    private void render(){
        list.removeAllViews();JSONArray orders=snapshot.optJSONArray("orders"),eligible=snapshot.optJSONArray("eligible");
        status.setText((eligible==null?0:eligible.length())+" order siap Tutup Buku • Rp "+String.format(Locale.US,"%,d",snapshot.optLong("totalRupiah")));
        if(orders==null)return;
        for(int i=0;i<orders.length();i++){
            JSONObject row=orders.optJSONObject(i);if(row==null)continue;
            LinearLayout card=column();card.setBackgroundColor(0xffffffff);
            card.addView(label(row.optString("orderRef")+" • "+row.optString("employeeName")+"\n"+row.optString("status")+" • "+row.optString("adminState")+(row.optBoolean("monitorArchived")?" • Arsip":"")));
            card.addView(label(row.isNull("wageRupiah")?"Belum dihargai":"Upah Rp "+String.format(Locale.US,"%,d",row.optLong("wageRupiah"))));
            Button edit=button("Ubah order");card.addView(edit);edit.setOnClickListener(v->edit(row));list.addView(card);
        }
    }
    private Spinner workerPicker(){
        Spinner picker=new Spinner(this);List<String> names=new ArrayList<>();
        if(workers!=null)for(int i=0;i<workers.length();i++){JSONObject e=workers.optJSONObject(i);names.add(e==null?"—":e.optString("name"));}
        picker.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,names));return picker;
    }
    private String workerCode(Spinner picker){JSONObject e=workers==null?null:workers.optJSONObject(picker.getSelectedItemPosition());return e==null?"":e.optString("code");}
    private void edit(JSONObject row){
        if(busy)return;LinearLayout form=column();
        String[] labels={"Isi upah bersih","Refund","Bermasalah","Normal","Pindahkan karyawan","Hapus / Arsip","Pulihkan"};
        String[] actions={"price","status","status","status","transfer","archive","restore"};
        Spinner action=new Spinner(this);action.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));form.addView(action);
        EditText wage=input("Upah rupiah utuh");wage.setInputType(InputType.TYPE_CLASS_NUMBER);if(!row.isNull("wageRupiah"))wage.setText(row.optString("wageRupiah"));form.addView(wage);
        Spinner employee=workerPicker();form.addView(employee);EditText reason=input("Alasan perubahan (wajib)");form.addView(reason);
        form.addView(label("Pemindahan order aktif mengulang TAKE/START. Hapus menyimpan arsip. Upah Tutup Buku dikunci."));
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle(row.optString("orderRef")).setView(form).setNegativeButton("Batal",null).setPositiveButton("Simpan",null).create();
        dialog.setOnShowListener(d->dialog.getButton(-1).setOnClickListener(v->{
            if(reason.getText().toString().trim().length()<3){reason.setError("Minimal 3 karakter");return;}
            try{int index=action.getSelectedItemPosition();JSONObject b=new JSONObject();b.put("orderRef",row.optString("orderRef"));b.put("version",row.optLong("version"));b.put("action",actions[index]);b.put("reason",reason.getText().toString().trim());
                if(index==0){String raw=wage.getText().toString();if(!raw.matches("[0-9]{1,10}")){wage.setError("Rupiah utuh");return;}b.put("wageRupiah",Long.parseLong(raw));}
                if(index>=1 && index<=3)b.put("state",index==1?"refund":index==2?"problem":"normal");
                if(index==4)b.put("employeeCode",workerCode(employee));
                dialog.dismiss();send("/management",b);
            }catch(Exception e){status.setText("Periksa data yang diisi.");}
        }));dialog.show();
    }
    private void send(String path,JSONObject body){if(busy)return;busy=true;status.setText("Menyimpan...");api.request("POST",path,body,(data,message,ok)->{
        if(destroyed)return;busy=false;if(!ok){status.setText(message+" Perbarui data sebelum mencoba lagi.");return;}
        if(path.equals("/books"))getPreferences(MODE_PRIVATE).edit().remove("closing_request").apply();load();
    });}
    private void closeBook(){
        if(busy)return;
        // Re-read to show the exact set sent for server-side optimistic validation.
        busy=true;api.request("GET","/management",null,(data,message,ok)->{
            if(destroyed)return;busy=false;if(!ok){status.setText(message);return;}snapshot=data;render();
            JSONArray eligible=data.optJSONArray("eligible");if(eligible==null || eligible.length()==0){status.setText("Belum ada order selesai yang dihargai.");return;}
            EditText title=input("Judul Tutup Buku");title.setText("Tutup Buku "+new java.text.SimpleDateFormat("dd MMM yyyy",Locale.getDefault()).format(new Date()));
            StringBuilder details=new StringBuilder();for(int i=0;i<eligible.length();i++){JSONObject e=eligible.optJSONObject(i);if(e!=null)details.append(e.optString("orderRef")).append(": Rp ").append(e.optLong("wageRupiah")).append("\n");}
            LinearLayout form=column();form.addView(title);form.addView(label(details+"\nTOTAL Rp "+String.format(Locale.US,"%,d",data.optLong("totalRupiah"))+"\nUpah dan penerima dikunci setelah Tutup Buku."));
            new AlertDialog.Builder(this).setTitle("Konfirmasi Tutup Buku").setView(form).setNegativeButton("Batal",null).setPositiveButton("Tutup Buku",(d,w)->{
                try{String id=getPreferences(MODE_PRIVATE).getString("closing_request",null);if(id==null){id=UUID.randomUUID().toString();getPreferences(MODE_PRIVATE).edit().putString("closing_request",id).apply();}
                    JSONObject b=new JSONObject();b.put("id",id);b.put("title",title.getText().toString().trim());b.put("expected",eligible);send("/books",b);
                }catch(Exception e){status.setText("Data Tutup Buku belum valid.");}
            }).show();
        });
    }
    private void accounts(){
        LinearLayout form=column();EditText username=input("Username"),email=input("Email pemilik akun baru"),password=input("Password akun baru (minimal 12 karakter)");
        password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        CheckBox create=new CheckBox(this);create.setText("Buat akun baru");CheckBox active=new CheckBox(this);active.setText("Akun aktif");active.setChecked(true);
        Spinner employee=workerPicker();form.addView(username);form.addView(employee);form.addView(create);form.addView(email);form.addView(password);form.addView(active);
        form.addView(label("Untuk akun yang sudah ada, isi username dan karyawan. Untuk mencabut akses, hilangkan Akun aktif."));
        new AlertDialog.Builder(this).setTitle("Akun Karyawan").setView(form).setNegativeButton("Batal",(d,w)->password.setText(""))
            .setPositiveButton("Simpan",(d,w)->{try{JSONObject b=new JSONObject();b.put("username",username.getText().toString().trim());b.put("employeeCode",workerCode(employee));b.put("active",active.isChecked());b.put("create",create.isChecked());b.put("email",email.getText().toString().trim());b.put("password",password.getText().toString());password.setText("");send("/accounts",b);}catch(Exception e){status.setText("Data akun belum valid.");}}).show();
    }
}
