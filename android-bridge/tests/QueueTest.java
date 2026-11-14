package com.telibot.bridge;
import java.util.*;
public class QueueTest {
 static void check(boolean value){if(!value)throw new AssertionError();}
 public static void main(String[]args){List<ReceiptQueueRunner.Item> items=Arrays.asList(new ReceiptQueueRunner.Item("bad","encrypted-one"),new ReceiptQueueRunner.Item("good","encrypted-two"));Set<String> removed=new HashSet<>();List<String> attempted=new ArrayList<>();
 ReceiptQueueRunner.Result result=ReceiptQueueRunner.run(items,item->{attempted.add(item.id);if(item.id.equals("bad"))throw new Exception("server rejected receipt");removed.add(item.id);},()->false);
 check(result.failed==1&&result.sent==1&&result.firstError!=null);check(attempted.equals(Arrays.asList("bad","good")));check(!removed.contains("bad")&&removed.contains("good"));
 removed.clear();result=ReceiptQueueRunner.run(items,item->{throw new Exception("offline");},()->false);check(result.failed==2&&result.sent==0&&removed.isEmpty());
 final boolean[] stopped={false};attempted.clear();result=ReceiptQueueRunner.run(items,item->{attempted.add(item.id);stopped[0]=true;},()->stopped[0]);check(result.stopped&&attempted.size()==1);
 System.out.println("PASS: rejected old receipt does not block next valid receipt; failed work retained; offline attempts accounted; cancellation stops remaining uploads");
 }
}
