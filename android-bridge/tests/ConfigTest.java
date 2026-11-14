package com.telibot.bridge;
public class ConfigTest {
 static void check(boolean value){if(!value)throw new AssertionError();}
 public static void main(String[]args){String expected="01712345678";
  for(String input:new String[]{"01712345678","+8801712345678","8801712345678","০১৭১২৩৪৫৬৭৮","+৮৮০১৭১২৩৪৫৬৭৮","01712-345678","(01712) 345678","01712\u00a0345678"})check(BridgeConfig.normalizeNumber(input).equals(expected));
  check(BridgeConfig.validAccount(expected));for(String bad:new String[]{"","01212345678","0171234567","017123456789","017XXXXXXXX"})check(!BridgeConfig.validAccount(bad));
  check(BridgeConfig.canChangeEndpoint("https://old.test/api","https://old.test/api",12));check(!BridgeConfig.canChangeEndpoint("https://old.test/api","https://new.test/api",12));check(!BridgeConfig.canChangeEndpoint("https://old.test/api","https://new.test/api",-1));check(BridgeConfig.canChangeEndpoint("https://old.test/api","https://new.test/api",0));
  System.out.println("PASS: Bangla/country-prefix/copied phone numbers normalize; invalid receiving accounts rejected; queued receipts prevent endpoint rerouting while same-endpoint number changes remain allowed");
 }
}
