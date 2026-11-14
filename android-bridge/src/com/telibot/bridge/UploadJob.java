package com.telibot.bridge;
import android.app.job.*;import android.content.*;import android.database.Cursor;import org.json.JSONObject;
public final class UploadJob extends JobService {
 private static final class Run {volatile boolean stopped;Thread thread;}
 private Run current;
 static void schedule(Context c){JobInfo j=new JobInfo.Builder(43,new ComponentName(c,UploadJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();int result=((JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE)).schedule(j);if(result!=JobScheduler.RESULT_SUCCESS)Store.note(c,"upload","Android পাঠানোর job চালু করতে পারেনি। Background/battery settings দেখুন।");}
 public boolean onStartJob(JobParameters params){Run run=new Run();current=run;run.thread=new Thread(()->{boolean retry=false;try{retry=!upload(run);}catch(Exception e){Store.note(this,"upload","ফোনের encrypted queue বা চাবি পড়া যায়নি। Pending মুছবেন না; রিপোর্ট দিন।");retry=true;}if(!run.stopped)jobFinished(params,retry);});run.thread.start();return true;}
 public boolean onStopJob(JobParameters p){if(current!=null){current.stopped=true;if(current.thread!=null)current.thread.interrupt();}return true;}
 private boolean upload(Run run)throws Exception{android.content.SharedPreferences p=Store.prefs(this);if(!p.getBoolean("enabled",false)){Store.note(this,"upload","Forwarding বন্ধ।");return true;}String endpoint=p.getString("url","");String secret=Store.open(p.getString("secret",""));
  try(Store store=new Store(this)){
   store.getWritableDatabase().delete("receipts","created < ?",new String[]{Long.toString(System.currentTimeMillis()-86400000L)});
   java.util.List<ReceiptQueueRunner.Item> items=new java.util.ArrayList<>();
   try(Cursor q=store.getReadableDatabase().rawQuery("SELECT id,body FROM receipts ORDER BY attempted,created LIMIT 20",null)){while(q.moveToNext())items.add(new ReceiptQueueRunner.Item(q.getString(0),q.getString(1)));}
   ReceiptQueueRunner.Result result=ReceiptQueueRunner.run(items,item->{
     store.getWritableDatabase().execSQL("UPDATE receipts SET attempted=? WHERE id=?",new Object[]{System.currentTimeMillis(),item.id});
     String body=Store.open(item.encrypted);JSONObject ack=BridgeHttp.post(endpoint,secret,body);
     if(!ack.optBoolean("accepted")||!item.id.equals(ack.optString("eventId")))throw new BridgeHttp.Failure("সার্ভার রেকর্ড গ্রহণ নিশ্চিত করেনি।");
     store.getWritableDatabase().delete("receipts","id=?",new String[]{item.id});
   },()->run.stopped||!p.getBoolean("enabled",false));
   if(result.stopped)return true;
   if(result.failed>0){String reason=result.firstError instanceof BridgeHttp.Failure?result.firstError.getMessage():"Encrypted রেকর্ড পড়া বা পাঠানো যায়নি।";Store.note(this,"upload","পাঠানো "+result.sent+"টি, ব্যর্থ "+result.failed+"টি: "+reason);}
   else Store.note(this,"upload",result.sent>0?"সার্ভার "+result.sent+"টি রেকর্ড গ্রহণ করেছে। বটে Check Payment দিন।":"পাঠানোর মতো pending রেকর্ড নেই। পুরোনো inbox নিজে থেকে পড়া হয় না।");

  try(Cursor left=store.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM receipts",null)){left.moveToFirst();return left.getInt(0)==0;}}
 }
}
