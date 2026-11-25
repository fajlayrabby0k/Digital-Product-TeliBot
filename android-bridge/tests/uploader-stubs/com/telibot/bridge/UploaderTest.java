package com.telibot.bridge;
import android.content.Context;import java.util.concurrent.*;
public final class UploaderTest {
 static void check(boolean value){if(!value)throw new AssertionError();}
 public static void main(String[]args)throws Exception{
  Context c=new Context();Store.rows.put("one","one");Store.rows.put("two","two");BridgeHttp.reject="one";
  check(!ReceiptUploader.upload(c,()->false));check(Store.rows.containsKey("one"));check(!Store.rows.containsKey("two"));check(BridgeHttp.calls==2);
  BridgeHttp.reject="";check(ReceiptUploader.upload(c,()->false));check(Store.rows.isEmpty());
  Store.rows.put("bad-ack","bad-ack");BridgeHttp.wrongAck=true;check(!ReceiptUploader.upload(c,()->false));check(Store.rows.containsKey("bad-ack"));BridgeHttp.wrongAck=false;check(ReceiptUploader.upload(c,()->false));
  Store.rows.put("three","three");Store.prefs.enabled=false;int before=BridgeHttp.calls;check(ReceiptUploader.upload(c,()->false));check(BridgeHttp.calls==before&&Store.rows.size()==1);Store.prefs.enabled=true;
  check(ReceiptUploader.upload(c,()->true));check(BridgeHttp.calls==before&&Store.rows.size()==1);
  BridgeHttp.entered=new CountDownLatch(1);BridgeHttp.release=new CountDownLatch(1);final Throwable[] failure={null};Thread first=new Thread(()->{try{check(ReceiptUploader.upload(c,()->false));}catch(Throwable e){failure[0]=e;}});first.start();check(BridgeHttp.entered.await(3,TimeUnit.SECONDS));check(!ReceiptUploader.upload(c,()->false));BridgeHttp.release.countDown();first.join(5000);check(!first.isAlive());if(failure[0]!=null)throw new AssertionError(failure[0]);check(BridgeHttp.calls==before+1&&Store.rows.isEmpty());
  System.out.println("PASS: shared foreground/job uploader retains rejected receipts, continues valid uploads, retries safely, respects Stop/Off and prevents concurrent duplicate uploads");
 }
}
