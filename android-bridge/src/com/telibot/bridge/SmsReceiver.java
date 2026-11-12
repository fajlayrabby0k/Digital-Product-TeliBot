package com.telibot.bridge;
import android.content.*;import android.provider.Telephony;import android.telephony.SmsMessage;import org.json.JSONObject;import java.util.*;
public final class SmsReceiver extends BroadcastReceiver {
 public void onReceive(Context c,Intent i){if(!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(i.getAction()))return;android.content.SharedPreferences p=Store.prefs(c);if(!p.getBoolean("enabled",false))return;
  try{SmsMessage[] parts=Telephony.Sms.Intents.getMessagesFromIntent(i);if(parts.length==0||parts.length>20)return;String sender=parts[0].getOriginatingAddress();if(sender==null)return;StringBuilder b=new StringBuilder();for(SmsMessage m:parts){if(!sender.equals(m.getOriginatingAddress()))return;b.append(m.getMessageBody());}String text=b.toString();
   for(String method:new String[]{"bkash","nagad"}){if(!sender.equalsIgnoreCase(p.getString(method+"Sender","")))continue;ReceiptParser.Receipt r=ReceiptParser.parse(text,method);if(r==null)continue;if(r.paidAt>System.currentTimeMillis()+300000L||r.paidAt<System.currentTimeMillis()-86400000L)return;
    String account=p.getString(method+"Account","");if(!account.matches("01[3-9][0-9]{8,9}"))return;
    JSONObject body=new JSONObject();String id=UUID.randomUUID().toString();body.put("version",1);body.put("eventId",id);body.put("deviceId",p.getString("device",""));body.put("method",method);body.put("account",account);body.put("trxId",r.trx);body.put("amountMinor",r.minor);body.put("receivedAt",System.currentTimeMillis());body.put("paidAt",r.paidAt);
    try(Store db=new Store(c)){db.add(id,body.toString());}UploadJob.schedule(c);return;
   }
  }catch(Exception ignored){/* No SMS bodies or secrets in logs. */}
 }
}
