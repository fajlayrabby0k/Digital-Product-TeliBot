package com.telibot.bridge;
import android.app.job.*;import android.content.*;import android.database.Cursor;import org.json.JSONObject;
public final class UploadJob extends JobService {
 private static final class Run {volatile boolean stopped;Thread thread;}
 private Run current;
 static void schedule(Context c){try{JobInfo j=new JobInfo.Builder(43,new ComponentName(c,UploadJob.class)).setPersisted(true).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();int result=((JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE)).schedule(j);if(result!=JobScheduler.RESULT_SUCCESS)Store.note(c,"upload","Android পাঠানোর job চালু করতে পারেনি। Background/battery settings দেখুন।");}catch(RuntimeException error){Store.note(c,"upload","Android background job আটকে দিয়েছে। ফোনের App/Battery settings দেখুন।");}}
 // Keep an existing pending/retry job and its backoff; recreate only a missing job.
 static void ensureScheduled(Context c){try{if(((JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE)).getPendingJob(43)==null)schedule(c);}catch(RuntimeException ignored){schedule(c);}}
 public boolean onStartJob(JobParameters params){Run run=new Run();current=run;run.thread=new Thread(()->{boolean retry=false;try{retry=!upload(run);}catch(Exception e){Store.note(this,"upload","ফোনের encrypted queue বা চাবি পড়া যায়নি। Pending মুছবেন না; রিপোর্ট দিন।");retry=true;}if(!run.stopped){HeartbeatJob.sendOnce(this);jobFinished(params,retry);}});run.thread.start();return true;}
 public boolean onStopJob(JobParameters p){if(current!=null){current.stopped=true;if(current.thread!=null)current.thread.interrupt();}return true;}
 private boolean upload(Run run)throws Exception{return ReceiptUploader.upload(this,()->run.stopped);}
}
