package com.telibot.bridge;
import org.json.JSONObject;import java.util.concurrent.*;
final class BridgeHttp {
 static String reject="";static boolean wrongAck;static int calls;static CountDownLatch entered,release;
 static final class Failure extends Exception {private static final long serialVersionUID=1L;Failure(String message){super(message);}}
 static JSONObject post(String url,String secret,String body)throws Exception {calls++;if(entered!=null){entered.countDown();if(!release.await(5,TimeUnit.SECONDS))throw new Failure("test timeout");}return new JSONObject(!reject.equals(body),wrongAck?"another-event":body);}
}
