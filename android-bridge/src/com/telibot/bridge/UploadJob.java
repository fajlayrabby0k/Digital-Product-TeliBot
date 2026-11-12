package com.telibot.bridge;
import android.app.job.*;import android.content.*;import android.database.Cursor;import org.json.JSONObject;
public final class UploadJob extends JobService {
 private static final class Run {volatile boolean stopped;Thread thread;}
 private Run current;
 static void schedule(Context c){JobInfo j=new JobInfo.Builder(43,new ComponentName(c,UploadJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();((JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE)).schedule(j);}
 public boolean onStartJob(JobParameters params){Run run=new Run();current=run;run.thread=new Thread(()->{boolean retry=false;try{retry=!upload(run);}catch(Exception e){retry=true;}if(!run.stopped)jobFinished(params,retry);});run.thread.start();return true;}
 public boolean onStopJob(JobParameters p){if(current!=null){current.stopped=true;if(current.thread!=null)current.thread.interrupt();}return true;}
 private boolean upload(Run run)throws Exception{android.content.SharedPreferences p=Store.prefs(this);if(!p.getBoolean("enabled",false))return true;String endpoint=p.getString("url","");String secret=Store.open(p.getString("secret",""));
  try(Store store=new Store(this)){store.getWritableDatabase().delete("receipts","created < ?",new String[]{Long.toString(System.currentTimeMillis()-86400000L)});try(Cursor q=store.getReadableDatabase().rawQuery("SELECT id,body FROM receipts ORDER BY created LIMIT 20",null)){
   while(q.moveToNext()){if(run.stopped||!p.getBoolean("enabled",false))return true;String body=Store.open(q.getString(1));JSONObject ack=BridgeHttp.post(endpoint,secret,body);if(!ack.optBoolean("accepted")||!q.getString(0).equals(ack.optString("eventId")))return false;store.getWritableDatabase().delete("receipts","id=?",new String[]{q.getString(0)});}
  }try(Cursor left=store.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM receipts",null)){left.moveToFirst();return left.getInt(0)==0;}}
 }
}
