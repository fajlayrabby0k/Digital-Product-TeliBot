package com.telibot.bridge;
import android.content.*;
public final class BootReceiver extends BroadcastReceiver {
 public void onReceive(Context c,Intent intent){String action=intent.getAction();if(!Intent.ACTION_BOOT_COMPLETED.equals(action)&&!Intent.ACTION_MY_PACKAGE_REPLACED.equals(action))return;
  if(Store.prefs(c).getBoolean("enabled",false)){BridgeService.start(c);UploadJob.ensureScheduled(c);HeartbeatJob.schedule(c);HeartbeatJob.sendOnce(c);}
 }
}
