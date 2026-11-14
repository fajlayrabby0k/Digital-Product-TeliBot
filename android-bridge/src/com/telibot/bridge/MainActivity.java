package com.telibot.bridge;
import android.app.*;import android.os.*;import android.content.pm.PackageManager;import android.widget.*;import android.text.InputType;import android.view.*;import java.util.*;import java.security.SecureRandom;import org.json.JSONObject;

public final class MainActivity extends Activity {
 private static final String ENDPOINT="https://digital-product-telibot.pages.dev/api/mobile-receipt";
 private final Map<String,EditText> fields=new LinkedHashMap<>();
 private final Handler refreshHandler=new Handler(Looper.getMainLooper());
 private final Runnable refresh=()->refreshStatus();
 private LinearLayout box,setup,advanced;
 private TextView status,notice;
 private Button start;
 private boolean testing,startAfterPermission;
 private int attemptNumber;
 private android.content.SharedPreferences p;
 private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density);}
 private void text(LinearLayout parent,String label,int size){TextView t=new TextView(this);t.setText(label);t.setTextSize(size);t.setPadding(0,dp(8),0,dp(6));parent.addView(t);}
 private Button button(LinearLayout parent,String label,Runnable action){Button b=new Button(this);b.setText(label);parent.addView(b);b.setOnClickListener(v->action.run());return b;}
 private void field(LinearLayout parent,String key,String label,String fallback,boolean number){text(parent,label,15);EditText e=new EditText(this);e.setText(p.getString(key,fallback));e.setTextSize(17);e.setSingleLine(true);e.setSaveEnabled(false);e.setImportantForAutofill(2);e.setInputType(number?InputType.TYPE_CLASS_PHONE:InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);if(number)e.setHint("01XXXXXXXXX");parent.addView(e);fields.put(key,e);}
 private String value(String key){return fields.get(key).getText().toString().trim();}
 private void say(String message){notice.setText(message);}
 private void copy(String label,String value){android.content.ClipData data=android.content.ClipData.newPlainText(label,value);android.os.PersistableBundle extra=new android.os.PersistableBundle();extra.putBoolean("android.content.extra.IS_SENSITIVE",true);data.getDescription().setExtras(extra);((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(data);say(label+" কপি হয়েছে। Cloudflare-এর একই নামের ঘরে Paste করুন। গোপন চাবি কাউকে পাঠাবেন না।");}
 public void onCreate(Bundle state){super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);p=Store.prefs(this);
  try{android.content.SharedPreferences.Editor init=p.edit();if(!p.contains("device"))init.putString("device",UUID.randomUUID().toString());if(!p.contains("secret")){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);StringBuilder key=new StringBuilder();for(byte b:bytes)key.append(String.format(Locale.ROOT,"%02x",b&255));init.putString("secret",Store.seal(key.toString()));}if(!init.commit())throw new Exception("storage unavailable");}catch(Exception e){TextView error=new TextView(this);error.setText("ফোনের নিরাপদ storage চালু করা যায়নি। ডাটা মুছবেন না; অ্যাপ বন্ধ করে আবার খুলুন।");setContentView(error);return;}
  ScrollView scroll=new ScrollView(this);box=new LinearLayout(this);box.setOrientation(1);box.setPadding(dp(20),dp(16),dp(20),dp(24));scroll.addView(box);setContentView(scroll);
  scroll.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());v.setPadding(safe.left,safe.top,safe.right,safe.bottom);}else applyLegacyInsets(v,insets);return insets;});
  text(box,"পেমেন্ট SMS সংযোগ · v0.7",24);
  status=new TextView(this);status.setTextSize(17);status.setPadding(0,dp(12),0,dp(12));box.addView(status);
  notice=new TextView(this);notice.setTextSize(15);box.addView(notice);
  start=button(box,"সেভ করে চালু করুন / সংযোগ পরীক্ষা",()->connect());
  button(box,"অপেক্ষার রেকর্ড এখন পাঠান",()->{if(!p.getBoolean("enabled",false)){say("প্রথমে ‘সেভ করে চালু করুন’ চাপুন।");return;}UploadJob.schedule(this);say("আবার পাঠানোর চেষ্টা হচ্ছে। রিপোর্টে পাঠানোর ফল দেখুন।");});
  button(box,"সেটআপ / নম্বর বদলান",()->setup.setVisibility(setup.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));
  button(box,"সমস্যার রিপোর্ট / কপি",()->showDiagnostics());
  button(box,"বন্ধ করুন",()->{stop();say("নতুন SMS পাঠানো বন্ধ। অপেক্ষার রেকর্ড মুছে যায়নি।");showStatus();});
  setup=new LinearLayout(this);setup.setOrientation(1);box.addView(setup);
  boolean configured=BridgeConfig.validAccount(p.getString("bkashAccount",""))||BridgeConfig.validAccount(p.getString("nagadAccount",""));setup.setVisibility(configured?View.GONE:View.VISIBLE);
  text(setup,"প্রথমবারের সেটআপ",20);text(setup,"বিকাশ চালাতে বিকাশ নম্বর এবং নগদ চালাতে নগদ নম্বর আলাদাভাবে দিন। যে মাধ্যম ব্যবহার করবেন না, তার ঘর ফাঁকা রাখুন। বটের Payment Settings-এও একই নম্বর দিন।",14);
  field(setup,"bkashAccount","টাকা পাওয়ার বিকাশ নম্বর","",true);field(setup,"nagadAccount","টাকা পাওয়ার নগদ নম্বর","",true);
  text(setup,"Cloudflare-এ একবার দুটি তথ্য দিন",19);
  button(setup,"গোপন চাবি কপি · MOBILE_BRIDGE_SECRET",()->{try{copy("MOBILE_BRIDGE_SECRET",Store.open(p.getString("secret","")));}catch(Exception e){say("চাবি পড়া যায়নি। ডাটা মুছবেন না; রিপোর্ট দিন।");}});
  button(setup,"ফোনের ID কপি · MOBILE_BRIDGE_DEVICE_ID",()->copy("MOBILE_BRIDGE_DEVICE_ID",p.getString("device","")));
  button(setup,"Cloudflare সেটআপ নির্দেশনা",()->new AlertDialog.Builder(this).setTitle("Cloudflare-এ একবার সেটআপ").setMessage("Workers & Pages → আপনার Pages project → Settings → Variables and Secrets → Production\n\nMOBILE_BRIDGE_SECRET (Type: Secret)\nঅ্যাপের গোপন চাবি কপি করে Paste করুন।\n\nMOBILE_BRIDGE_DEVICE_ID (Type: Text)\nফোনের ID কপি করে Paste করুন।\n\nSave → সর্বশেষ deployment Redeploy করুন। আগে থেকেই সেট করা থাকলে বদলাবেন না। গোপন চাবি চ্যাটে পাঠাবেন না।").setPositiveButton("বুঝেছি",null).show());
  button(setup,"অন্য সেটিং / পরীক্ষা",()->advanced.setVisibility(advanced.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));
  advanced=new LinearLayout(this);advanced.setOrientation(1);advanced.setVisibility(View.GONE);setup.addView(advanced);
  text(advanced,"সাধারণত বদলানোর প্রয়োজন নেই",16);
  field(advanced,"url","বটের ঠিকানা",ENDPOINT,false);field(advanced,"bkashSender","বিকাশ SMS sender",ReceiptParser.BKASH_SENDER,false);field(advanced,"nagadSender","নগদ SMS sender",ReceiptParser.NAGAD_SENDER,false);
  if(value("bkashSender").isEmpty())fields.get("bkashSender").setText(ReceiptParser.BKASH_SENDER);if(value("nagadSender").isEmpty())fields.get("nagadSender").setText(ReceiptParser.NAGAD_SENDER);
  button(advanced,"SMS format ফোনেই পরীক্ষা",()->preview());
  button(advanced,"ফোনের SMS / Battery settings",()->openPhoneSettings());
  button(advanced,"Pending রেকর্ড মুছুন",()->new AlertDialog.Builder(this).setMessage("শুধু নিশ্চিত হলে মুছুন। অপেক্ষায় থাকা পেমেন্ট রেকর্ড হারাবে; পরে inbox থেকে উদ্ধার হবে না।").setNegativeButton("না",null).setPositiveButton("মুছুন",(d,w)->{stop();try(Store s=new Store(this)){s.getWritableDatabase().delete("receipts",null,null);}say("বন্ধ করা হয়েছে ও pending রেকর্ড মুছে গেছে।");showStatus();}).show());
  text(box,"শুধু নতুন টাকা পাওয়ার SMS নেওয়া হয়। OTP বা পুরো SMS সার্ভারে যায় না। বটে TrxID জমা দিলে মিলিয়ে ভেরিফাই হবে। রকেট এখন বন্ধ।",14);
  showStatus();
 }
 private void openPhoneSettings(){try{startActivity(new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+getPackageName())));}catch(Exception e){say("ফোনের Settings → Apps → TeliBot Receipt Bridge খুলুন।");}}
 protected void onDestroy(){attemptNumber++;testing=false;refreshHandler.removeCallbacks(refresh);super.onDestroy();}
 @SuppressWarnings("deprecation") private void applyLegacyInsets(View v,WindowInsets insets){v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());}
 private void stop(){attemptNumber++;testing=false;startAfterPermission=false;p.edit().putBoolean("enabled",false).apply();((android.app.job.JobScheduler)getSystemService(JOB_SCHEDULER_SERVICE)).cancel(43);if(start!=null)start.setEnabled(true);}
 protected void onResume(){super.onResume();if(status!=null&&p!=null){showStatus();if(p.getBoolean("enabled",false)&&pendingCount()>0)UploadJob.schedule(this);refreshHandler.removeCallbacks(refresh);refreshHandler.postDelayed(refresh,2000);}}
 protected void onPause(){refreshHandler.removeCallbacks(refresh);super.onPause();}
 private void refreshStatus(){if(status!=null&&p!=null)showStatus();refreshHandler.postDelayed(refresh,2000);}
 private int pendingCount(){try(Store s=new Store(this);android.database.Cursor q=s.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM receipts",null)){if(q.moveToFirst())return q.getInt(0);}catch(Exception ignored){}return -1;}
 private String diagnosticTime(long time){if(time<=0)return "সময় নেই";java.text.SimpleDateFormat f=new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss",Locale.ROOT);f.setTimeZone(TimeZone.getTimeZone("Asia/Dhaka"));return f.format(new Date(time));}
 private String activeMethods(){java.util.List<String> methods=new ArrayList<>();if(BridgeConfig.validAccount(p.getString("bkashAccount","")))methods.add("বিকাশ");if(BridgeConfig.validAccount(p.getString("nagadAccount","")))methods.add("নগদ");return methods.isEmpty()?"কোনো মাধ্যম সেট হয়নি":android.text.TextUtils.join(", ",methods);}
 private String diagnosticReport(){String host;try{host=new java.net.URL(p.getString("url",ENDPOINT)).getHost();}catch(Exception e){host="ঠিকানা ভুল";}
  return "TeliBot Bridge v0.7\n"+(p.getBoolean("enabled",false)?"SMS সংগ্রহ চালু":"বন্ধ আছে")+" · অপেক্ষায় "+pendingCount()+"টি রেকর্ড\nSMS permission: "+(checkSelfPermission("android.permission.RECEIVE_SMS")==PackageManager.PERMISSION_GRANTED?"আছে":"নেই")+"\nসক্রিয় মাধ্যম: "+activeMethods()+"\nServer: "+host+"\nPhone time (Dhaka): "+diagnosticTime(System.currentTimeMillis())+"\nশেষ সংযোগ পরীক্ষা: "+(p.getBoolean("connection_ok",false)?"সফল":"পুনরায় পরীক্ষা প্রয়োজন")+"\nসময়: "+diagnosticTime(p.getLong("connection_at",0))+"\n\nশেষ কোম্পানি SMS: "+p.getString("last_capture","এই সংস্করণে এখনো কোনো ঘটনা রেকর্ড হয়নি।")+"\nসময়: "+diagnosticTime(p.getLong("last_capture_at",0))+"\n\nশেষ পাঠানোর চেষ্টা: "+p.getString("last_upload","কোনো চেষ্টা রেকর্ড হয়নি।")+"\nসময়: "+diagnosticTime(p.getLong("last_upload_at",0));
 }
 private void showStatus(){status.setText((p.getBoolean("enabled",false)?(checkSelfPermission("android.permission.RECEIVE_SMS")==PackageManager.PERMISSION_GRANTED?"SMS সংগ্রহ: চালু":"SMS permission নেই — চালু করুন চাপুন"):"বন্ধ আছে")+"\nসক্রিয়: "+activeMethods()+"\nঅপেক্ষায়: "+pendingCount()+"টি রেকর্ড\nসার্ভার: "+(p.getBoolean("connection_ok",false)?"শেষ সংযোগ পরীক্ষা সফল":"সংযোগ পরীক্ষা প্রয়োজন")+"\n"+p.getString("last_upload",""));}
 private void copyReport(){((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("Bridge diagnostics",diagnosticReport()));say("রিপোর্ট কপি হয়েছে। গোপন চাবি, নম্বর বা SMS-এর লেখা এতে নেই।");}
 private void showDiagnostics(){showStatus();new AlertDialog.Builder(this).setTitle("অ্যাপের পরীক্ষার রিপোর্ট").setMessage(diagnosticReport()).setPositiveButton("রিপোর্ট কপি",(d,w)->copyReport()).setNeutralButton("ফোনের সেটিং",(d,w)->openPhoneSettings()).setNegativeButton("বন্ধ",null).show();}
 public void onRequestPermissionsResult(int r,String[] permissions,int[] grants){super.onRequestPermissionsResult(r,permissions,grants);if(p==null||status==null)return;boolean resume=startAfterPermission;startAfterPermission=false;if(checkSelfPermission("android.permission.RECEIVE_SMS")==PackageManager.PERMISSION_GRANTED){if(resume)connect();else{say("SMS permission দেওয়া আছে। চালু করতে মূল বাটন চাপুন।");showStatus();}}else{say("SMS permission না থাকলে নতুন পেমেন্ট ধরা যাবে না। রিপোর্টের ‘ফোনের সেটিং’ থেকে অনুমতি দিন।");showStatus();}}
 private boolean saveSettings(){try{
  java.net.URL u=new java.net.URL(value("url"));if(!u.getProtocol().equals("https")||u.getHost().isEmpty()||u.getUserInfo()!=null||u.getQuery()!=null||u.getRef()!=null)throw new Exception("বটের সরাসরি HTTPS ঠিকানা দিন।");
  boolean configured=false,changed=false;
  for(String method:new String[]{"bkash","nagad"}){String account=normalize(value(method+"Account"));fields.get(method+"Account").setText(account);if(account.isEmpty())continue;if(!BridgeConfig.validAccount(account))throw new Exception((method.equals("bkash")?"বিকাশ":"নগদ")+"-এর ১১ অঙ্কের টাকা পাওয়ার নম্বর দিন।");if(!value(method+"Sender").matches("[A-Za-z][A-Za-z0-9 -]{1,24}|[0-9]{3,6}"))throw new Exception("কোম্পানির SMS sender দিন।");configured=true;}
  if(!configured)throw new Exception("টাকা পাওয়ার বিকাশ অথবা নগদ নম্বর দিন।");
  for(String key:fields.keySet())if(!value(key).equals(p.getString(key,"")))changed=true;
  if(changed){
   // Do not silently delete receipts on a setup change. Old signed payloads keep their original account.
   if(!BridgeConfig.canChangeEndpoint(p.getString("url",ENDPOINT),value("url"),pendingCount()))throw new Exception("Pending রেকর্ড আছে বা storage পড়া যাচ্ছে না। বটের URL বদলানো বন্ধ রাখা হয়েছে; আগে বর্তমান সার্ভারে পাঠান বা রিপোর্ট দিন। কোনো রেকর্ড মোছা হয়নি।");
   attemptNumber++;testing=false;((android.app.job.JobScheduler)getSystemService(JOB_SCHEDULER_SERVICE)).cancel(43);
   android.content.SharedPreferences.Editor e=p.edit();for(String key:fields.keySet())e.putString(key,value(key));e.putBoolean("connection_ok",false);if(!e.commit())throw new Exception("সেটিং সেভ হয়নি।");
  }
  return true;
 }catch(Exception e){setup.setVisibility(View.VISIBLE);say("সেভ হয়নি: "+e.getMessage());return false;}}
 static String normalize(String number){return BridgeConfig.normalizeNumber(number);}

 private void connect(){
  if(testing)return;if(!saveSettings())return;
  if(checkSelfPermission("android.permission.RECEIVE_SMS")!=PackageManager.PERMISSION_GRANTED){startAfterPermission=true;say("SMS permission দিন; অনুমতি পেলেই চালু হবে।");requestPermissions(new String[]{"android.permission.RECEIVE_SMS"},1);return;}
  final String localSecret;
  try{if(pendingCount()<0)throw new Exception("queue unavailable");localSecret=Store.open(p.getString("secret",""));}catch(Exception e){stop();say("ফোনের encrypted queue বা চাবি পড়া যাচ্ছে না। ডাটা/pending মুছবেন না; সমস্যার রিপোর্ট দিন।");showStatus();return;}
  // Offline capture is useful: server downtime must not discard a newly received valid payment.
  p.edit().putBoolean("enabled",true).apply();testing=true;final int attempt=++attemptNumber;start.setEnabled(false);say("SMS সংগ্রহ চালু। সার্ভারের সংযোগ পরীক্ষা হচ্ছে…");showStatus();
  final String url=p.getString("url",ENDPOINT),device=p.getString("device",""),bkash=p.getString("bkashAccount",""),nagad=p.getString("nagadAccount","");
  new Thread(()->{String message;boolean ok=false;try{JSONObject body=new JSONObject();body.put("version",1);body.put("type","check");body.put("deviceId",device);body.put("bkashAccount",bkash);body.put("nagadAccount",nagad);JSONObject result=BridgeHttp.post(url,localSecret,body.toString());ok=result.optBoolean("connected")&&device.equals(result.optString("deviceId"));message=ok?"সংযোগ সফল। নতুন পেমেন্ট SMS স্বয়ংক্রিয়ভাবে পাঠানো চালু; pending থাকলেও আবার চেষ্টা হবে।":"সার্ভার সংযোগ নিশ্চিত হয়নি। ফোনে রেকর্ড রাখা চালু আছে।";}catch(Exception e){message=(e instanceof BridgeHttp.Failure?e.getMessage():"চাবি/storage পড়া বা সংযোগ পরীক্ষা হয়নি।")+" ফোনে SMS সংরক্ষণ চালু আছে; রিপোর্ট দেখুন।";}
   final boolean success=ok;final String feedback=message;runOnUiThread(()->{if(isDestroyed()||attempt!=attemptNumber)return;testing=false;start.setEnabled(true);p.edit().putBoolean("connection_ok",success).putLong("connection_at",System.currentTimeMillis()).apply();say(feedback);if(success){setup.setVisibility(View.GONE);UploadJob.schedule(this);}showStatus();});
  }).start();
 }
 private void preview(){EditText input=new EditText(this);input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);input.setSaveEnabled(false);input.setImportantForAutofill(2);new AlertDialog.Builder(this).setTitle("পেমেন্ট SMS পেস্ট করুন · শুধু ফোনে পরীক্ষা").setView(input).setPositiveButton("পরীক্ষা",(d,w)->{String result="সমর্থিত SMS format মেলেনি।";for(String method:new String[]{"bkash","nagad"}){ReceiptParser.Receipt r=ReceiptParser.parse(input.getText().toString(),method);if(r!=null){result=(method.equals("bkash")?"বিকাশ":"নগদ")+" · "+java.math.BigDecimal.valueOf(r.minor,2).toPlainString()+" টাকা · TrxID "+r.trx+"\nSMS format ঠিক আছে। এটি সার্ভারে পাঠানো হয়নি।";break;}}input.setText("");say(result);}).setNegativeButton("বাতিল",(d,w)->input.setText("")).show();}
}
