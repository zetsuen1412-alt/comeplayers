package id.comeplayers.boostmonitor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.util.ReflectionHelpers;
import java.util.ArrayList;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public final class OrderHomeViewTest {
    private Activity activity;
    private ArrayList<String> takes;
    private JSONArray orders;
    @Before public void setup() throws Exception {
        activity=Robolectric.buildActivity(Activity.class).setup().get();takes=new ArrayList<>();
        orders=new JSONArray().put(new JSONObject().put("orderRef","X100").put("game","AION")
            .put("discord","Discord Demo").put("task","Full task visible in details").put("canTake",true))
            .put(new JSONObject().put("orderRef","X900").put("game","WoW").put("canTake",false));
    }
    private OrderHomeView home(boolean loading,boolean loaded,String error) {
        return new OrderHomeView(activity,orders,loading,loaded,error,false,"",()->{},takes::add,value->{});
    }
    @Test public void cardsKeepServerNewestFirstAndTakeOnlyTheSelectedOrder() {
        OrderHomeView view=home(false,true,"");activity.setContentView(view);
        View first=view.findViewWithTag("order:X100"),second=view.findViewWithTag("order:X900");
        assertSame(first.getParent(),second.getParent());
        assertTrue(((ViewGroup)first.getParent()).indexOfChild(first)<((ViewGroup)second.getParent()).indexOfChild(second));
        ((Button)view.findViewWithTag("take:X100")).performClick();assertEquals(java.util.List.of("X100"),takes);
        assertFalse(((Button)view.findViewWithTag("take:X900")).isEnabled());
    }
    @Test public void detailDoesNotTakeAnOrderUntilItsExplicitAction() {
        OrderHomeView view=home(false,true,"");activity.setContentView(view);
        ((Button)view.findViewWithTag("detail:X100")).performClick();assertTrue(takes.isEmpty());
        AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();assertNotNull(dialog);
        assertTrue(Shadows.shadowOf(dialog).getMessage().toString().contains("Discord Demo"));
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();assertEquals(java.util.List.of("X100"),takes);
    }
    @Test public void loadingOrFailedRefreshBlocksTakeAndPreservesReadableCards() {
        for(OrderHomeView view:new OrderHomeView[]{home(true,true,""),home(false,true,"Koneksi gagal")}){
            assertNotNull(view.findViewWithTag("order:X100"));assertFalse(((Button)view.findViewWithTag("take:X100")).isEnabled());
            ((Button)view.findViewWithTag("take:X100")).performClick();assertTrue(takes.isEmpty());
            ((Button)view.findViewWithTag("detail:X100")).performClick();
            AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();assertFalse(dialog.getButton(AlertDialog.BUTTON_POSITIVE).getVisibility()==View.VISIBLE);
            dialog.dismiss();
        }
        assertTrue(takes.isEmpty());
    }
    @Test public void searchFindsDiscordWithoutLosingTakeIdentity() {
        OrderHomeView view=home(false,true,"");((EditText)view.findViewWithTag("order-search")).setText("discord demo");
        assertNotNull(view.findViewWithTag("order:X100"));assertNull(view.findViewWithTag("order:X900"));
        ((Button)view.findViewWithTag("take:X100")).performClick();assertEquals(java.util.List.of("X100"),takes);
    }
    @Test public void bottomNavigationHasOnlyThreeLargeDestinations() {
        ArrayList<String> routes=new ArrayList<>();LinearLayout nav=OrderHomeView.navigation(activity,"Data Tutup Buku",routes::add);
        assertEquals(3,nav.getChildCount());assertTrue(nav.findViewWithTag("nav:Menu").isSelected());
        for(int i=0;i<nav.getChildCount();i++)assertTrue(nav.getChildAt(i).getLayoutParams().height>=48*activity.getResources().getDisplayMetrics().density);
        nav.findViewWithTag("nav:Order Baru").performClick();assertEquals(java.util.List.of("Order Baru"),routes);
    }
    @Test public void smallestPhoneKeepsActionsInsideTheScreen() {
        OrderHomeView view=home(false,true,"");int width=Math.round(296*activity.getResources().getDisplayMetrics().density);
        view.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));
        view.layout(0,0,width,view.getMeasuredHeight());
        Button take=view.findViewWithTag("take:X100");assertTrue(take.getWidth()>0);assertTrue(take.getHeight()>=48*activity.getResources().getDisplayMetrics().density);
        assertTrue(take.getRight()<=((View)take.getParent()).getWidth());
    }
    @Test public void savedLoginOpensOrdersAndSecondaryFeaturesStayInMenu() {
        RuntimeEnvironment.getApplication().getSharedPreferences("payroll_session_secure",Context.MODE_PRIVATE).edit().putString("session","synthetic-presence-only").commit();
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()){
            MainActivity main=controller.get();View root=main.getWindow().getDecorView();
            assertNotNull(root.findViewWithTag("order-search"));
            root.findViewWithTag("nav:Menu").performClick();
            assertTrue(root.findViewWithTag("nav:Menu").isSelected());
            main.onBackPressed();assertNotNull(root.findViewWithTag("order-search"));
        }
    }
    @Test @GraphicsMode(GraphicsMode.Mode.NATIVE) @Config(sdk=35,qualifiers="w360dp-h800dp-mdpi")
    public void renderActualHomeAtPhoneSize() throws Exception {
        RuntimeEnvironment.getApplication().getSharedPreferences("payroll_session_secure",Context.MODE_PRIVATE).edit().putString("session","synthetic-presence-only").commit();
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create().visible()){
            MainActivity main=controller.get();ReflectionHelpers.setField(main,"pendingOrders",orders);ReflectionHelpers.setField(main,"pendingLoaded",true);
            ReflectionHelpers.callInstanceMethod(main,"render");
            View decor=main.getWindow().getDecorView();decor.measure(View.MeasureSpec.makeMeasureSpec(360,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(800,View.MeasureSpec.EXACTLY));decor.layout(0,0,360,800);
            assertNotNull(decor.findViewWithTag("order:X100"));assertTrue(decor.findViewWithTag("nav:Order Baru").isSelected());
            String output=System.getenv("MONITOR_PREVIEW_DIR");
            if(output!=null){
                java.io.File dir=new java.io.File(output);if(!dir.isDirectory()&&!dir.mkdirs())throw new java.io.IOException("Cannot create preview directory");
                android.graphics.Bitmap image=android.graphics.Bitmap.createBitmap(360,800,android.graphics.Bitmap.Config.ARGB_8888);decor.draw(new android.graphics.Canvas(image));
                try(java.io.FileOutputStream stream=new java.io.FileOutputStream(new java.io.File(dir,"android-order-home.png"))){assertTrue(image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream));}image.recycle();
            }
        }
    }
}
