package com.telibot.bridge;
import android.app.*;import android.content.*;import android.net.*;import android.os.*;import android.database.Cursor;import java.util.concurrent.*;
/** User-enabled visible foreground SMS relay, with persisted JobScheduler fallback. */
public final class BridgeService extends Service {
 private static final String STOP="com.telibot.bridge.STOP";
 private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
 private volatile boolean stopped;
 private static volatile BridgeService current;
 static void start(Context c){if(!Store.prefs(c).getBoolean("enabled",false))return;try{c.startForegroundService(new Intent(c,BridgeService.class));}catch(RuntimeException error){Store.note(c,"service","Background start blocked; open the app and tap Save and Start.");UploadJob.ensureScheduled(c);}}
 static void halt(Context c){c.stopService(new Intent(c,BridgeService.class));}
 static void receiptReady(Context c){BridgeService running=current;if(running!=null)running.wake();else start(c);}
 private void wake(){if(!stopped)try{worker.execute(()->tick());}catch(RejectedExecutionException ignored){}}
 public void onCreate(){super.onCreate();stopped=false;current=this;
  NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);manager.createNotificationChannel(new NotificationChannel("payment_sms_bridge","Payment SMS bridge",NotificationManager.IMPORTANCE_LOW));
  PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,BridgeService.class).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification notification=new Notification.Builder(this,"payment_sms_bridge").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Payment SMS bridge active").setContentText("bKash / Nagad incoming payments • tap to open").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).addAction(new Notification.Action.Builder(null,"Stop forwarding",stop).build()).build();
  if(Build.VERSION.SDK_INT>=34)startForeground(46,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);else startForeground(46,notification);
  Store.note(this,"service","Foreground relay started.");worker.scheduleWithFixedDelay(()->tick(),0,30,TimeUnit.SECONDS);
 }
 public int onStartCommand(Intent intent,int flags,int id){
  if(intent!=null&&STOP.equals(intent.getAction())){Store.prefs(this).edit().putBoolean("enabled",false).apply();JobStop.stop(this);stopSelf();return START_NOT_STICKY;}
  if(!Store.prefs(this).getBoolean("enabled",false)){stopSelf();return START_NOT_STICKY;}wake();return START_STICKY;
 }
 private void tick(){try{uploadTick();}catch(Exception error){Store.note(this,"service","Background relay interrupted; fallback retry scheduled.");UploadJob.ensureScheduled(this);}}
 private void uploadTick(){
  if(stopped||!Store.prefs(this).getBoolean("enabled",false))return;
  Store.prefs(this).edit().putLong("service_tick_at",System.currentTimeMillis()).apply();
  ConnectivityManager network=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);Network active=network.getActiveNetwork();NetworkCapabilities capabilities=active==null?null:network.getNetworkCapabilities(active);
  if(capabilities==null||!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))return;
  PowerManager.WakeLock lock=null;
  try{
   try(Store store=new Store(this);Cursor q=store.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM receipts",null)){if(!q.moveToFirst()||q.getInt(0)==0)return;}
   lock=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"TeliBot:ReceiptUpload");lock.acquire(40000);
   long deadline=SystemClock.elapsedRealtime()+20000;
   ReceiptUploader.upload(this,()->stopped||SystemClock.elapsedRealtime()>=deadline);
   HeartbeatJob.sendOnce(this);
  }catch(Exception error){Store.note(this,"upload",error instanceof BridgeHttp.Failure?error.getMessage():"Upload failed; receipts remain encrypted for retry.");UploadJob.ensureScheduled(this);}
  finally{if(lock!=null&&lock.isHeld())lock.release();}
 }
 public void onDestroy(){stopped=true;if(current==this)current=null;worker.shutdownNow();stopForeground(STOP_FOREGROUND_REMOVE);Store.note(this,"service","Foreground relay stopped.");super.onDestroy();}
 public IBinder onBind(Intent intent){return null;}
 private static final class JobStop {static void stop(Context c){((android.app.job.JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE)).cancel(43);HeartbeatJob.schedule(c);HeartbeatJob.sendOnce(c);}}
}
