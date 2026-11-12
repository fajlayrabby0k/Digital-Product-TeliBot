package com.telibot.bridge;
import android.app.job.*;import android.content.*;import android.database.Cursor;import javax.net.ssl.HttpsURLConnection;import javax.crypto.*;import javax.crypto.spec.SecretKeySpec;import java.net.*;import java.nio.charset.StandardCharsets;import org.json.JSONObject;
public final class UploadJob extends JobService {
 private volatile boolean stopped;private Thread thread;
 static void schedule(Context c){JobInfo j=new JobInfo.Builder(43,new ComponentName(c,UploadJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();((JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE)).schedule(j);}
 public boolean onStartJob(JobParameters params){stopped=false;thread=new Thread(()->{boolean retry=false;try{retry=!upload();}catch(Exception e){retry=true;}if(!stopped)jobFinished(params,retry);});thread.start();return true;}
 public boolean onStopJob(JobParameters p){stopped=true;if(thread!=null)thread.interrupt();return true;}
 private boolean upload()throws Exception{android.content.SharedPreferences p=Store.prefs(this);if(!p.getBoolean("enabled",false))return true;
  String endpoint=p.getString("url","");URL u=new URL(endpoint);if(!u.getProtocol().equals("https")||u.getUserInfo()!=null||u.getRef()!=null)return true;
  String secret=Store.open(p.getString("secret",""));
  try(Store store=new Store(this)){store.getWritableDatabase().delete("receipts","created < ?",new String[]{Long.toString(System.currentTimeMillis()-86400000L)});try(Cursor q=store.getReadableDatabase().rawQuery("SELECT id,body FROM receipts ORDER BY created LIMIT 20",null)){
   while(q.moveToNext()){if(stopped||!Store.prefs(this).getBoolean("enabled",false))return true;String body=Store.open(q.getString(1));String ts=Long.toString(System.currentTimeMillis()/1000);Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));byte[]digest=mac.doFinal((body+ts).getBytes(StandardCharsets.UTF_8));StringBuilder sig=new StringBuilder();for(byte v:digest)sig.append(String.format(java.util.Locale.ROOT,"%02x",v&255));
    HttpsURLConnection conn=(HttpsURLConnection)u.openConnection();try{conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(8000);conn.setReadTimeout(8000);conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("X-Timestamp",ts);conn.setRequestProperty("X-Signature",sig.toString());byte[] bytes=body.getBytes(StandardCharsets.UTF_8);conn.setFixedLengthStreamingMode(bytes.length);try(java.io.OutputStream out=conn.getOutputStream()){out.write(bytes);}int status=conn.getResponseCode();
    // Require an explicit JSON acknowledgement; a website returning 200 is not a receipt server.
    if(status!=200)return false;String ack;try(java.io.InputStream in=conn.getInputStream()){java.io.ByteArrayOutputStream buf=new java.io.ByteArrayOutputStream();byte[]chunk=new byte[512];int n;while((n=in.read(chunk))!=-1){if(buf.size()+n>2048)return false;buf.write(chunk,0,n);}ack=new String(buf.toByteArray(),StandardCharsets.UTF_8);}JSONObject a=new JSONObject(ack);if(!a.optBoolean("accepted")||!q.getString(0).equals(a.optString("eventId")))return false;
    store.getWritableDatabase().delete("receipts","id=?",new String[]{q.getString(0)});
    }finally{conn.disconnect();}
   }
  }try(Cursor left=store.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM receipts",null)){left.moveToFirst();return left.getInt(0)==0;}}
 }
}
