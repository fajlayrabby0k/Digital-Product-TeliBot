package com.telibot.bridge;
import android.content.*;import android.provider.Telephony;import android.telephony.SmsMessage;import org.json.JSONObject;import java.util.*;
public final class SmsReceiver extends BroadcastReceiver {
 public void onReceive(Context c,Intent i){if(!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(i.getAction()))return;
  android.content.SharedPreferences p=Store.prefs(c);
  try{SmsMessage[] parts=Telephony.Sms.Intents.getMessagesFromIntent(i);if(parts.length==0||parts.length>20)return;String sender=parts[0].getOriginatingAddress();if(sender==null)return;
   String method=null;for(String m:new String[]{"bkash","nagad"})if(ReceiptParser.matchesSender(m,sender,p.getString(m+"Sender",""))){method=m;break;}
   if(method==null)return;
   if(!p.getBoolean("enabled",false)){Store.note(c,"capture",method+": কোম্পানির SMS এসেছে, কিন্তু forwarding বন্ধ।");return;}
   StringBuilder text=new StringBuilder();for(SmsMessage m:parts){if(!sender.equals(m.getOriginatingAddress()))return;text.append(m.getMessageBody());}
   ReceiptParser.Receipt r=ReceiptParser.parse(text.toString(),method);
   if(r==null){Store.note(c,"capture",method+": SMS এসেছে, কিন্তু incoming payment format মেলেনি। SMS format ফোনেই পরীক্ষা করুন।");return;}
   if(r.paidAt>System.currentTimeMillis()+300000L||r.paidAt<System.currentTimeMillis()-86400000L){Store.note(c,"capture",method+": SMS-এর সময় ফোনের সময়ের সঙ্গে মিলছে না। Automatic date/time দেখুন।");return;}
   String account=p.getString(method+"Account","");if(!account.matches("01[3-9][0-9]{8}")){Store.note(c,"capture",method+": টাকা পাওয়ার নম্বর সেট করা নেই বা ভুল।");return;}
   JSONObject body=new JSONObject();String id=UUID.randomUUID().toString();body.put("version",1);body.put("eventId",id);body.put("deviceId",p.getString("device",""));body.put("method",method);body.put("account",account);body.put("trxId",r.trx);body.put("amountMinor",r.minor);body.put("receivedAt",System.currentTimeMillis());body.put("paidAt",r.paidAt);
   boolean saved;try(Store db=new Store(c)){saved=db.add(id,body.toString());}
   Store.note(c,"capture",saved?method+": পেমেন্ট শনাক্ত হয়েছে এবং encrypted queue-তে রাখা হয়েছে।":method+": Queue পূর্ণ; নতুন রেকর্ড রাখা যায়নি।");UploadJob.schedule(c);
  }catch(Exception ignored){Store.note(c,"capture","পেমেন্ট রেকর্ড ফোনে সংরক্ষণ/প্রসেস করা যায়নি। অ্যাপ খুলে রিপোর্ট দেখুন।");}
 }
}
