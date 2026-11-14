package com.telibot.bridge;
/** Setup rules kept independent of Android UI/storage for regression testing. */
public final class BridgeConfig {
 public static String normalizeNumber(String number){StringBuilder b=new StringBuilder();for(char c:number.toCharArray()){if(c>='০'&&c<='৯')b.append((char)('0'+c-'০'));else if(c!=' '&&c!='-'&&c!='('&&c!=')'&&!Character.isSpaceChar(c))b.append(c);}String value=b.toString();if(value.startsWith("+880"))value="0"+value.substring(4);else if(value.startsWith("880"))value="0"+value.substring(3);return value;}
 public static boolean validAccount(String value){return value!=null&&value.matches("01[3-9][0-9]{8}");}
 public static boolean canChangeEndpoint(String previous,String next,int pending){return previous.equals(next)||pending==0;}
}
