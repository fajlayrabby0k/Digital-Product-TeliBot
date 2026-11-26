package com.telibot.bridge;
/** Known incoming templates, with synthetic account/transaction identifiers. */
public final class ReceiptFixtureExport {
 public static void main(String[] args){
  String[] methods={"bkash","bkash","nagad","nagad","nagad","nagad","nagad","bkash"};
  String[] senders={"bKash","bKash","NAGAD","NAGAD","NAGAD","NAGAD","NAGAD","bKash"};
  String[] texts={
   "You have received Tk 13.00 from 01800000000. Fee Tk 0.00. Balance Tk 2,134.63. TrxID TEST000001 at 14/11/2026 14:18",
   "You have received Tk 26.00 from 01800000000. Ref 2. Fee Tk 0.00. Balance Tk 2,160.63. TrxID TEST000002 at 14/11/2026 14:56",
   "Money Received.\nAmount: Tk 400.00\nSender: 01800000000\nRef: N/A\nTxnID: TEST0003\nBalance: Tk 1600.01\n14/11/2026 16:27",
   "Money Received.\nAmount: Tk 23.00\nSender: 01800000000\nTxnID: TEST0004\nBalance: Tk 23.00\n14/11/2026 22:22",
   "Cash In Received.\nAmount: Tk 546.00\nUddokta: 01300000000\nTxnID: TEST0005\nBalance: 3645.00\n26/11/2026 00:30",
   "Cash In Received.\nAmount: Tk 546.00\nUddokta: 01300000000\nTxnID: TEST0006\nBalance: 3645.00\n26/11/2026 00:30",
   "Cash In Received.\nAmount: Tk 546.00\nUddokta: 01300000000\nTxnID: TEST0007\nBalance: 3645.00\n26/11/2026 00:30",
   "You have received Tk 125.00 from 01800000000. Ref deposit. Fee Tk 0.00. Balance Tk 2,160.63. TrxID TEST000008 at 26/11/2026 08:45"
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
