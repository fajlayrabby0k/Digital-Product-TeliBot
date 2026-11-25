package com.telibot.bridge;
import android.content.Context;import android.database.Cursor;import org.json.JSONObject;
/** One uploader shared by foreground service and persisted fallback job. */
final class ReceiptUploader {
 private static boolean busy;
 static boolean upload(Context context,ReceiptQueueRunner.Stop stop)throws Exception{
  synchronized(ReceiptUploader.class){if(busy)return false;busy=true;}
  try{return perform(context,stop);}finally{synchronized(ReceiptUploader.class){busy=false;}}
 }
 private static boolean perform(Context context,ReceiptQueueRunner.Stop stop)throws Exception{
  android.content.SharedPreferences p=Store.prefs(context);if(!p.getBoolean("enabled",false)||stop.stopped())return true;
  String endpoint=p.getString("url",""),secret=Store.open(p.getString("secret",""));
  try(Store store=new Store(context)){
   store.getWritableDatabase().delete("receipts","created < ?",new String[]{Long.toString(System.currentTimeMillis()-86400000L)});
   java.util.List<ReceiptQueueRunner.Item> items=new java.util.ArrayList<>();
   try(Cursor q=store.getReadableDatabase().rawQuery("SELECT id,body FROM receipts ORDER BY attempted,created LIMIT 20",null)){while(q.moveToNext())items.add(new ReceiptQueueRunner.Item(q.getString(0),q.getString(1)));}
   ReceiptQueueRunner.Result result=ReceiptQueueRunner.run(items,item->{
    store.getWritableDatabase().execSQL("UPDATE receipts SET attempted=? WHERE id=?",new Object[]{System.currentTimeMillis(),item.id});
    JSONObject ack=BridgeHttp.post(endpoint,secret,Store.open(item.encrypted));
    if(!ack.optBoolean("accepted")||!item.id.equals(ack.optString("eventId")))throw new BridgeHttp.Failure("Server did not confirm this receipt. It remains queued.");
    store.getWritableDatabase().delete("receipts","id=?",new String[]{item.id});
   },()->stop.stopped()||!p.getBoolean("enabled",false));
   if(result.failed>0)Store.note(context,"upload",result.firstError instanceof BridgeHttp.Failure?result.firstError.getMessage():"Encrypted receipt could not be uploaded; retained for retry.");
   else if(result.sent>0)Store.note(context,"upload","Server accepted "+result.sent+" receipt(s).");
   if(result.stopped)return false;
   try(Cursor left=store.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM receipts",null)){left.moveToFirst();return left.getInt(0)==0;}
  }
 }
}
