package com.telibot.bridge;
import java.util.regex.*;
import java.text.SimpleDateFormat;
import java.util.*;
/** Full-message templates based on administrator-supplied incoming receipt examples. */
public final class ReceiptParser {
 private static final String MONEY="(?:[0-9]{1,9}|[0-9]{1,3}(?:,[0-9]{3}){1,2})(?:\\.[0-9]{2})";
 private static final String DATE="([0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2})";
 private static final Pattern BKASH=Pattern.compile("You have received Tk ("+MONEY+") from 01[3-9][0-9]{8}\\. (?:Ref [^\\r\\n]{0,100}?\\. )?Fee Tk "+MONEY+"\\. Balance Tk "+MONEY+"\\. TrxID ([A-Z0-9]{10}) at "+DATE);
 private static final Pattern NAGAD=Pattern.compile("Money Received\\.\\r?\\nAmount: Tk ("+MONEY+")\\r?\\nSender: 01[3-9][0-9]{8}\\r?\\n(?:Ref: [^\\r\\n]{0,100}\\r?\\n)?TxnID: ([A-Z0-9]{8})\\r?\\nBalance: Tk "+MONEY+"\\r?\\n"+DATE);
 public static final String BKASH_SENDER="bKash",NAGAD_SENDER="NAGAD";
 public static boolean matchesSender(String method,String sender,String configured){
  if(sender==null||!("bkash".equals(method)||"nagad".equals(method)))return false;
  String expected=configured==null?"":configured.trim();
  if(expected.isEmpty())expected="bkash".equals(method)?BKASH_SENDER:NAGAD_SENDER;
  // A contact display name never turns an ordinary SIM number into a company sender.
  if(!expected.matches("[A-Za-z][A-Za-z0-9 -]{1,24}|[0-9]{3,6}"))return false;
  return expected.equalsIgnoreCase(sender.trim());
 }
 public static final class Receipt { public final long minor,paidAt; public final String trx; Receipt(long m,String t,long p){minor=m;trx=t;paidAt=p;} }
 public static Receipt parse(String text,String method) {
  if(text==null||text.length()>1000)return null;
  Pattern pattern="bkash".equals(method)?BKASH:"nagad".equals(method)?NAGAD:null;
  if(pattern==null)return null;
  // Match the entire incoming receipt. Reference text is opaque, never extracted or uploaded.
  // OTP/outgoing messages do not have this full incoming-receipt structure.
  Matcher m=pattern.matcher(text.trim());if(!m.matches())return null;
  try {
   long minor=new java.math.BigDecimal(m.group(1).replace(",","")).movePointRight(2).longValueExact();
   SimpleDateFormat format=new SimpleDateFormat("dd/MM/yyyy HH:mm",Locale.ROOT);format.setLenient(false);format.setTimeZone(TimeZone.getTimeZone("Asia/Dhaka"));
   Date paid=format.parse(m.group(3));if(!format.format(paid).equals(m.group(3)))return null;
   return minor>0&&minor<=100000000?new Receipt(minor,m.group(2),paid.getTime()):null;
  }catch(Exception e){return null;}
 }
}
