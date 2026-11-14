package com.telibot.bridge;
public class ParserTest {
 static void check(boolean b){if(!b)throw new AssertionError();}
 public static void main(String[]args){String b="You have received Tk 500.00 from 01400000000. Fee Tk 0.00. Balance Tk 9,918.88. TrxID TEST123456 at 02/11/2026 22:43";
 String n="Money Received.\nAmount: Tk 400.00\nSender: 01600000000\nRef: N/A\nTxnID: TEST1234\nBalance: Tk 1200.01\n04/11/2026 01:52";
 String withRef="You have received Tk 13.00 from 01800000000. Ref 2. Fee Tk 0.00. Balance Tk 2,134.63. TrxID TEST123456 at 14/11/2026 14:18";
 ReceiptParser.Receipt referenced=ReceiptParser.parse(withRef,"bkash");check(referenced!=null&&referenced.minor==1300&&referenced.trx.equals("TEST123456"));
 check(ReceiptParser.parse(withRef.replace("Ref 2.","Ref Store 123."),"bkash").minor==1300);
 for(String rejected:new String[]{withRef.replace("Ref 2.","Ref OTP 123456."),withRef.replace("Ref 2.","Ref 2"),withRef.replace("received","sent"),withRef.replace("TrxID TEST123456","TrxID BAD")})check(ReceiptParser.parse(rejected,"bkash")==null);
 ReceiptParser.Receipt r=ReceiptParser.parse(b,"bkash");check(r!=null&&r.minor==50000&&r.trx.equals("TEST123456"));
 check(ReceiptParser.parse(b.replace("500.00","650.00"),"bkash").minor==65000);
 check(ReceiptParser.parse(n,"nagad").minor==40000);check(ReceiptParser.parse(n.replace("\n","\r\n"),"nagad").minor==40000);
 check(ReceiptParser.parse(n.replace("1200.01","1600.01"),"nagad").minor==40000);
 for(String t:new String[]{b+" OTP 123456",b.replace("received","sent"),b.replace("500.00","0.00"),b.replace("500.00","1.999"),b.replace("500.00","1,23.00"),b.replace("500.00","1000001.00"),b.replace("02/11/2026","31/11/2026"),b.replace("22:43","25:43"),b.replace("TrxID TEST123456","TrxID SHORT"),b.replace("500.00","-500.00")})check(ReceiptParser.parse(t,"bkash")==null);
 check(ReceiptParser.parse(b,"rocket")==null);check(ReceiptParser.parse(b,"nagad")==null);check(ReceiptParser.parse(n.replace("N/A","OTP 123456"),"nagad")==null);
 System.out.println("PASS: bKash with/without Ref and Nagad receipt formats, fee/balance separation, exact amount/date validation, OTP/outgoing rejection; Rocket disabled");
 }
}
