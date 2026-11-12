package com.telibot.bridge;
import android.app.*;
import android.os.Bundle;
import android.content.pm.PackageManager;
import android.widget.*;
import android.text.InputType;
import android.view.*;
import java.util.*;
import java.security.SecureRandom;
import org.json.JSONObject;

public final class MainActivity extends Activity {
 private static final String ENDPOINT="https://digital-product-telibot.pages.dev/api/mobile-receipt";
 private final Map<String,EditText> fields=new LinkedHashMap<>();
 private LinearLayout box,advanced;
 private TextView status;
 private Button start;
 private boolean testing;
 private int attemptNumber;
 private android.content.SharedPreferences p;
 private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density);}
 private void text(LinearLayout parent,String label,int size){TextView t=new TextView(this);t.setText(label);t.setTextSize(size);t.setPadding(0,dp(8),0,dp(6));parent.addView(t);}
 private Button button(LinearLayout parent,String label,Runnable action){Button b=new Button(this);b.setText(label);parent.addView(b);b.setOnClickListener(v->action.run());return b;}
 private void field(LinearLayout parent,String key,String label,String fallback,boolean number){text(parent,label,15);EditText e=new EditText(this);e.setText(p.getString(key,fallback));e.setTextSize(17);e.setSingleLine(true);e.setSaveEnabled(false);e.setImportantForAutofill(2);e.setInputType(number?InputType.TYPE_CLASS_PHONE:InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);if(number)e.setHint("01XXXXXXXXX");parent.addView(e);fields.put(key,e);}
 private String value(String key){return fields.get(key).getText().toString().trim();}
 private void say(String message){status.setText(message);Toast.makeText(this,message,Toast.LENGTH_LONG).show();}
 private void copy(String label,String value){android.content.ClipData data=android.content.ClipData.newPlainText(label,value);android.os.PersistableBundle extra=new android.os.PersistableBundle();extra.putBoolean("android.content.extra.IS_SENSITIVE",true);data.getDescription().setExtras(extra);((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(data);say(label+" কপি হয়েছে। Cloudflare-এর একই নামের ঘরে Paste করুন। গোপন চাবি কাউকে পাঠাবেন না।");}
 public void onCreate(Bundle state){super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);p=Store.prefs(this);
  try{android.content.SharedPreferences.Editor init=p.edit();if(!p.contains("device"))init.putString("device",UUID.randomUUID().toString());if(!p.contains("secret")){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);StringBuilder key=new StringBuilder();for(byte b:bytes)key.append(String.format(Locale.ROOT,"%02x",b&255));init.putString("secret",Store.seal(key.toString()));}init.commit();}catch(Exception e){TextView error=new TextView(this);error.setText("ফোনের নিরাপদ storage চালু করা যায়নি। অ্যাপ বন্ধ করে আবার খুলুন।");setContentView(error);return;}
  ScrollView scroll=new ScrollView(this);box=new LinearLayout(this);box.setOrientation(1);box.setPadding(dp(20),dp(16),dp(20),dp(24));scroll.addView(box);setContentView(scroll);
  scroll.setOnApplyWindowInsetsListener((v,insets)->{if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets safe=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout());v.setPadding(safe.left,safe.top,safe.right,safe.bottom);}else{applyLegacyInsets(v,insets);}return insets;});
  text(box,"পেমেন্ট SMS সংযোগ",25);text(box,"সহজ সেটআপ · v0.2\nআপনার বটের ঠিকানা আগে থেকেই দেওয়া আছে।",16);
  status=new TextView(this);status.setTextSize(16);status.setPadding(0,dp(12),0,dp(12));box.addView(status);
  text(box,"১. SMS-এর অনুমতি দিন",20);text(box,"শুধু নতুন SMS গ্রহণ করবে। পুরোনো ইনবক্স পড়বে না।",14);
  button(box,"SMS permission দিন",()->requestPermissions(new String[]{"android.permission.RECEIVE_SMS"},1));
  text(box,"২. আপনার টাকা পাওয়ার নম্বর দিন",20);text(box,"যে মাধ্যম ব্যবহার করবেন না, তার নম্বর ফাঁকা রাখুন। বটের Payment Settings-এও একই নম্বর দিন।",14);
  field(box,"bkashAccount","বিকাশ নম্বর", "",true);field(box,"nagadAccount","নগদ নম্বর","",true);
  text(box,"৩. Cloudflare-এ একবার সংযোগ করুন",20);text(box,"দুটি বাটন থেকে আলাদা করে কপি করুন। নিচের নির্দেশনা অনুযায়ী Cloudflare-এ দিন, তারপর Redeploy করুন।",14);
  button(box,"গোপন চাবি কপি · MOBILE_BRIDGE_SECRET",()->{try{copy("MOBILE_BRIDGE_SECRET",Store.open(p.getString("secret","")));}catch(Exception e){say("চাবি পড়া যায়নি। আবার অ্যাপ খুলুন।");}});
  button(box,"ফোনের ID কপি · MOBILE_BRIDGE_DEVICE_ID",()->copy("MOBILE_BRIDGE_DEVICE_ID",p.getString("device","")));
  button(box,"Cloudflare কোথায় কী দেব?",()->new AlertDialog.Builder(this).setTitle("Cloudflare-এ একবার সেটআপ").setMessage("Cloudflare → Workers & Pages → আপনার Pages project → Settings → Variables and Secrets → Production\n\nMOBILE_BRIDGE_SECRET\nType: Secret\nঅ্যাপের ‘গোপন চাবি কপি’ বাটনের লেখা Paste করুন।\n\nMOBILE_BRIDGE_DEVICE_ID\nType: Text\nঅ্যাপের ‘ফোনের ID কপি’ বাটনের লেখা Paste করুন।\n\nSave করে Deployments থেকে সর্বশেষ কোড Redeploy করুন। আগে থেকেই সেট করা থাকলে বদলানোর দরকার নেই। গোপন চাবি চ্যাটে পাঠাবেন না।").setPositiveButton("বুঝেছি",null).show());
  text(box,"৪. পরীক্ষা করে চালু করুন",20);start=button(box,"সংযোগ পরীক্ষা করে চালু করুন",()->connect());
  button(box,"শুধু সেটিং সেভ করুন",()->{if(saveSettings())say("সেটিং সেভ হয়েছে। এখন সংযোগ পরীক্ষা করে চালু করুন।");});
  button(box,"বন্ধ করুন",()->{stop();say("বন্ধ আছে। নতুন SMS সার্ভারে পাঠাবে না। Pending রেকর্ড রাখা আছে।");});
  button(box,"অন্য সেটিং / পরীক্ষা",()->advanced.setVisibility(advanced.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));
  advanced=new LinearLayout(this);advanced.setOrientation(1);advanced.setVisibility(View.GONE);box.addView(advanced);
  text(advanced,"প্রয়োজন ছাড়া বদলাবেন না",18);text(advanced,"বটের ঠিকানা ও sender আগে থেকেই দেওয়া। Sender না মিললে SMS-এ দেখানো কোম্পানির হুবহু নাম দিন।",14);
  field(advanced,"url","বটের ঠিকানা",ENDPOINT,false);field(advanced,"bkashSender","বিকাশ SMS sender","bKash",false);field(advanced,"nagadSender","নগদ SMS sender","NAGAD",false);
  // Old versions saved blank senders. Restore defaults without replacing explicit custom values.
  if(value("bkashSender").isEmpty())fields.get("bkashSender").setText("bKash");if(value("nagadSender").isEmpty())fields.get("nagadSender").setText("NAGAD");
  button(advanced,"SMS format ফোনেই পরীক্ষা",()->preview());button(advanced,"Pending রেকর্ড আবার পাঠান",()->{UploadJob.schedule(this);say("আবার পাঠানোর চেষ্টা হবে। ইন্টারনেট ও forwarding চালু থাকতে হবে।");});
  button(advanced,"Pending রেকর্ড মুছুন",()->new AlertDialog.Builder(this).setMessage("ফোনে পাঠানোর অপেক্ষায় থাকা রেকর্ড মুছবেন? সার্ভারের রেকর্ড মুছবে না।").setNegativeButton("না",null).setPositiveButton("মুছুন",(d,w)->{stop();try(Store s=new Store(this)){s.getWritableDatabase().delete("receipts",null,null);}say("বন্ধ করা হয়েছে ও pending রেকর্ড মুছেছে।");}).show());
  text(box,"রকেট এখন বন্ধ। এই সংস্করণে শুধু SMS পেমেন্টের রেকর্ড পৌঁছাবে; অটো ব্যালেন্স যোগ/ডেলিভারি এখনো চালু হয়নি।",14);
  showStatus();
 }
 protected void onDestroy(){attemptNumber++;testing=false;super.onDestroy();}
 @SuppressWarnings("deprecation") private void applyLegacyInsets(View v,android.view.WindowInsets insets){v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());}
 private void stop(){attemptNumber++;testing=false;p.edit().putBoolean("enabled",false).apply();((android.app.job.JobScheduler)getSystemService(JOB_SCHEDULER_SERVICE)).cancel(43);if(start!=null)start.setEnabled(true);}
 private void showStatus(){int pending=0;try(Store s=new Store(this);android.database.Cursor q=s.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM receipts",null)){if(q.moveToFirst())pending=q.getInt(0);}say((p.getBoolean("enabled",false)?"চালু আছে":"বন্ধ আছে")+" · অপেক্ষায় "+pending+"টি রেকর্ড\n"+(checkSelfPermission("android.permission.RECEIVE_SMS")==PackageManager.PERMISSION_GRANTED?"SMS permission দেওয়া আছে":"SMS permission দিন"));}
 public void onRequestPermissionsResult(int r,String[] permissions,int[] grants){super.onRequestPermissionsResult(r,permissions,grants);showStatus();}
 private boolean saveSettings(){try{
  java.net.URL u=new java.net.URL(value("url"));if(!u.getProtocol().equals("https")||u.getHost().isEmpty()||u.getUserInfo()!=null||u.getQuery()!=null||u.getRef()!=null)throw new Exception("বটের ঠিকানায় সরাসরি HTTPS URL দিন।");boolean configured=false,changed=false;
  for(String method:new String[]{"bkash","nagad"}){String account=normalize(value(method+"Account"));fields.get(method+"Account").setText(account);if(account.isEmpty())continue;if(!account.matches("01[3-9][0-9]{8}"))throw new Exception((method.equals("bkash")?"বিকাশ":"নগদ")+"-এর সঠিক ১১ অঙ্কের নম্বর দিন।");if(!value(method+"Sender").matches("[A-Za-z][A-Za-z0-9 -]{1,24}|[0-9]{3,6}"))throw new Exception("SMS-এর কোম্পানির sender name দিন।");configured=true;}
  if(!configured)throw new Exception("অন্তত বিকাশ অথবা নগদের টাকা পাওয়ার নম্বর দিন।");for(String key:fields.keySet())if(!value(key).equals(p.getString(key,"")))changed=true;
  if(changed){stop();try(Store s=new Store(this)){s.getWritableDatabase().delete("receipts",null,null);}android.content.SharedPreferences.Editor e=p.edit();for(String key:fields.keySet())e.putString(key,value(key));if(!e.commit())throw new Exception("সেটিং সেভ হয়নি। আবার চেষ্টা করুন।");}
  return true;
 }catch(Exception e){say("সেভ হয়নি: "+e.getMessage());return false;}}
 static String normalize(String number){StringBuilder b=new StringBuilder();for(char c:number.toCharArray()){if(c>='০'&&c<='৯')b.append((char)('0'+c-'০'));else if(c!=' '&&c!='-'&&c!='('&&c!=')')b.append(c);}String s=b.toString();if(s.startsWith("+880"))s="0"+s.substring(4);else if(s.startsWith("880"))s="0"+s.substring(3);return s;}
 private void connect(){if(testing)return;if(!saveSettings())return;if(checkSelfPermission("android.permission.RECEIVE_SMS")!=PackageManager.PERMISSION_GRANTED){say("প্রথম ধাপের SMS permission দিন।");return;}testing=true;final int attempt=++attemptNumber;start.setEnabled(false);say("সার্ভারের সংযোগ পরীক্ষা হচ্ছে…");
  final String url=p.getString("url",ENDPOINT),device=p.getString("device",""),bkash=p.getString("bkashAccount",""),nagad=p.getString("nagadAccount","");
  new Thread(()->{String result;boolean ok=false;try{JSONObject body=new JSONObject();body.put("version",1);body.put("type","check");body.put("deviceId",device);body.put("bkashAccount",bkash);body.put("nagadAccount",nagad);JSONObject reply=BridgeHttp.post(url,Store.open(p.getString("secret","")),body.toString());ok=reply.optBoolean("connected")&&device.equals(reply.optString("deviceId"));result=ok?"সংযোগ ঠিক আছে। SMS পাঠানো চালু হয়েছে। এখন একটি নতুন ছোট পেমেন্ট দিয়ে পরীক্ষা করুন।":"সার্ভার সংযোগ নিশ্চিত করেনি।";}catch(Exception e){result=e.getMessage()==null?"সংযোগ হয়নি। ইন্টারনেট ও Cloudflare সেটিং দেখুন।":e.getMessage();}final boolean success=ok;final String message=result;runOnUiThread(()->{if(isDestroyed()||attempt!=attemptNumber)return;start.setEnabled(true);if(!testing)return;testing=false;if(success){p.edit().putBoolean("enabled",true).apply();UploadJob.schedule(this);}say(message);});}).start();
 }
 private void preview(){EditText input=new EditText(this);input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);input.setSaveEnabled(false);input.setImportantForAutofill(2);new AlertDialog.Builder(this).setTitle("পেমেন্ট SMS পেস্ট করুন · শুধু ফোনে পরীক্ষা").setView(input).setPositiveButton("পরীক্ষা",(d,w)->{String result="সমর্থিত SMS format মেলেনি।";for(String method:new String[]{"bkash","nagad"}){ReceiptParser.Receipt r=ReceiptParser.parse(input.getText().toString(),method);if(r!=null){result=(method.equals("bkash")?"বিকাশ":"নগদ")+" · "+java.math.BigDecimal.valueOf(r.minor,2).toPlainString()+" টাকা · TrxID "+r.trx+"\nSMS format ঠিক আছে। এটি সার্ভারে পাঠানো হয়নি।";break;}}input.setText("");say(result);}).setNegativeButton("বাতিল",(d,w)->input.setText("")).show();}
}
