package com.telibot.bridge;
import javax.net.ssl.HttpsURLConnection;import javax.crypto.Mac;import javax.crypto.spec.SecretKeySpec;import java.net.URL;import java.nio.charset.StandardCharsets;import java.util.Locale;import org.json.JSONObject;
final class BridgeHttp {
 static final class Failure extends Exception {private static final long serialVersionUID=1L;Failure(String message){super(message);}}
 private static JSONObject read(java.io.InputStream in)throws Exception{
  if(in==null)return new JSONObject();
  try(java.io.InputStream source=in;java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){byte[] buf=new byte[512];int n;while((n=source.read(buf))!=-1){if(out.size()+n>2048)throw new Failure("সার্ভার থেকে ভুল response এসেছে।");out.write(buf,0,n);}try{return new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));}catch(Exception e){throw new Failure("বটের ঠিকানা ও সর্বশেষ Deploy পরীক্ষা করুন।");}}
 }
 static JSONObject post(String endpoint,String secret,String body)throws Exception{
  URL url=new URL(endpoint);if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||url.getQuery()!=null||url.getRef()!=null)throw new Failure("বটের HTTPS ঠিকানা ঠিক করুন।");
  String ts=Long.toString(System.currentTimeMillis()/1000);Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));StringBuilder sig=new StringBuilder();for(byte b:mac.doFinal((body+ts).getBytes(StandardCharsets.UTF_8)))sig.append(String.format(Locale.ROOT,"%02x",b&255));
  HttpsURLConnection conn=(HttpsURLConnection)url.openConnection();try{
   conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(8000);conn.setReadTimeout(8000);conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("X-Timestamp",ts);conn.setRequestProperty("X-Signature",sig.toString());byte[] data=body.getBytes(StandardCharsets.UTF_8);conn.setFixedLengthStreamingMode(data.length);try(java.io.OutputStream out=conn.getOutputStream()){out.write(data);}int status=conn.getResponseCode();
   if(status!=200){JSONObject error;try{error=read(conn.getErrorStream());}catch(Exception ignored){error=new JSONObject();}String code=error.optString("error");
    String message=status==401?"গোপন চাবি বা ফোনের সময় মিলছে না। Cloudflare Secret ও automatic date/time দেখুন।":status==403?"ফোনের ID মিলছে না। Cloudflare-এর MOBILE_BRIDGE_DEVICE_ID ঠিক করুন।":status==409?("receipt_conflict".equals(code)?"একই TrxID/event-এর অন্য রেকর্ড সার্ভারে আছে। এই রেকর্ড pending রাখা হয়েছে।":"বটের Payment Settings ও অ্যাপে একই টাকা পাওয়ার নম্বর দিন।"):status==503?"Cloudflare settings/ডাটাবেজ দেখুন এবং Redeploy করুন।":status==400?"রেকর্ড বা তার সময় সার্ভার গ্রহণ করেনি। ফোনে automatic date/time ও সঠিক নম্বর নিশ্চিত করুন।":status==404?"বটের সঠিক ঠিকানা ও নতুন Deploy দেখুন।":"সার্ভারে সংযোগ হয়নি।";
    throw new Failure("HTTP "+status+": "+message);
   }
   return read(conn.getInputStream());
  }catch(java.io.IOException e){throw new Failure("ইন্টারনেট বা সার্ভারে সংযোগ পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।");}finally{conn.disconnect();}
 }
}
