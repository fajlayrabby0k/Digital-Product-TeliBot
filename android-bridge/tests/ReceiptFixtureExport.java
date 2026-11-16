package com.telibot.bridge;
/** Known incoming templates, with synthetic account/transaction identifiers. */
public final class ReceiptFixtureExport {
 public static void main(String[] args){
  String[] methods={"bkash","bkash","nagad","nagad"};
  String[] senders={"bKash","bKash","NAGAD","NAGAD"};
  String[] texts={
   "You have received Tk 13.00 from 01800000000. Fee Tk 0.00. Balance Tk 2,134.63. TrxID TEST000001 at 14/11/2026 14:18",
   "You have received Tk 26.00 from 01800000000. Ref 2. Fee Tk 0.00. Balance Tk 2,160.63. TrxID TEST000002 at 14/11/2026 14:56",
   "Money Received.\nAmount: Tk 400.00\nSender: 01800000000\nRef: N/A\nTxnID: TEST0003\nBalance: Tk 1600.01\n14/11/2026 16:27",
   "Money Received.\nAmount: Tk 23.00\nSender: 01800000000\nTxnID: TEST0004\nBalance: Tk 23.00\n14/11/2026 22:22"
  };
  StringBuilder out=new StringBuilder("[");
  for(int i=0;i<texts.length;i++){
   if(!ReceiptParser.matchesSender(methods[i],senders[i],null))throw new AssertionError("Company sender did not match");
   ReceiptParser.Receipt receipt=ReceiptParser.parse(texts[i],methods[i]);if(receipt==null)throw new AssertionError("Known incoming template did not parse");
   if(i>0)out.append(',');
   out.append("{\"method\":\"").append(methods[i]).append("\",\"amountMinor\":").append(receipt.minor).append(",\"trxId\":\"").append(receipt.trx).append("\",\"paidAt\":").append(receipt.paidAt).append('}');
  }
  System.out.println(out.append(']'));
 }
}
