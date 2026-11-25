package com.telibot.bridge;
import android.app.job.*;import android.content.*;import android.content.pm.PackageManager;import android.database.Cursor;import android.os.PowerManager;import org.json.JSONObject;

/** Minimal authenticated health telemetry; never reads inbox messages or sends SMS bodies. */
public final class HeartbeatJob extends JobService {
 private static final class Run {volatile boolean stopped;Thread thread;}
 private final java.util.concurrent.ConcurrentHashMap<Integer,Run> runs=new java.util.concurrent.ConcurrentHashMap<>();
 static void schedule(Context c){
  try{JobScheduler scheduler=(JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE);
   if(Store.prefs(c).getBoolean("enabled",false)){if(scheduler.getPendingJob(44)==null)scheduler.schedule(new JobInfo.Builder(44,new ComponentName(c,HeartbeatJob.class)).setPersisted(true).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60000L,5*60000L).build());}
   else scheduler.cancel(44);
  }catch(RuntimeException ignored){Store.note(c,"heartbeat","Health reporting could not be scheduled. Check Android background settings.");}
 }
 static void sendOnce(Context c){try{((JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE)).schedule(new JobInfo.Builder(45,new ComponentName(c,HeartbeatJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());}catch(RuntimeException ignored){Store.note(c,"heartbeat","Health report could not be scheduled.");}}
 public boolean onStartJob(JobParameters params){Run run=new Run();runs.put(params.getJobId(),run);run.thread=new Thread(()->{boolean retry=false;try{
   android.content.SharedPreferences p=Store.prefs(this);String secret=Store.open(p.getString("secret","")),endpoint=p.getString("url","");
   if(endpoint.isEmpty()||secret.length()<32||p.getString("device","").isEmpty()){runs.remove(params.getJobId(),run);if(!run.stopped)jobFinished(params,false);return;}
   int pending=0;try(Store store=new Store(this);Cursor count=store.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM receipts",null)){if(count.moveToFirst())pending=count.getInt(0);}
   if(p.getBoolean("enabled",false)&&pending>0)UploadJob.ensureScheduled(this);
   JSONObject body=new JSONObject();body.put("type","heartbeat");body.put("version",1);body.put("deviceId",p.getString("device",""));body.put("appVersion","1.0");body.put("enabled",p.getBoolean("enabled",false));body.put("smsPermission",checkSelfPermission("android.permission.RECEIVE_SMS")==PackageManager.PERMISSION_GRANTED);body.put("queuePending",pending);PowerManager power=(PowerManager)getSystemService(POWER_SERVICE);body.put("batteryExempt",power!=null&&power.isIgnoringBatteryOptimizations(getPackageName()));body.put("lastCaptureAt",p.getLong("last_capture_at",0));body.put("lastCaptureState",p.getString("capture_state",p.contains("last_capture_at")?"unknown":"none"));body.put("lastCaptureMethod",p.getString("capture_method","none"));body.put("bkashAccount",p.getString("bkashAccount",""));body.put("nagadAccount",p.getString("nagadAccount",""));
   JSONObject response=BridgeHttp.post(endpoint,secret,body.toString());if(!response.optBoolean("heartbeat")||!p.getString("device","").equals(response.optString("deviceId")))throw new BridgeHttp.Failure("Server did not confirm the health report.");
   Store.note(this,"heartbeat","ok".equals(response.optString("configuration"))?"Health report sent to admin dashboard.":"Health report sent; receiving-number setup needs attention.");
  }catch(Exception error){retry=true;Store.note(this,"heartbeat",error instanceof BridgeHttp.Failure?error.getMessage():"Health report unavailable; it will retry.");}runs.remove(params.getJobId(),run);if(!run.stopped)jobFinished(params,retry);});run.thread.start();return true;}
 public boolean onStopJob(JobParameters params){Run run=runs.remove(params.getJobId());if(run!=null){run.stopped=true;if(run.thread!=null)run.thread.interrupt();}return true;}
}
