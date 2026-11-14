package com.telibot.bridge;
import java.util.List;
/** Queue orchestration only: keep rejected work and continue other receipts. */
public final class ReceiptQueueRunner {
 public static final class Item {public final String id,encrypted;public Item(String i,String e){id=i;encrypted=e;}}
 public interface Delivery {void deliver(Item item)throws Exception;}
 public interface Stop {boolean stopped();}
 public static final class Result {public int sent,failed;public Exception firstError;public boolean stopped;}
 public static Result run(List<Item> items,Delivery delivery,Stop stop){Result result=new Result();for(Item item:items){if(stop.stopped()){result.stopped=true;break;}try{delivery.deliver(item);result.sent++;}catch(Exception e){result.failed++;if(result.firstError==null)result.firstError=e;}}return result;}
}
