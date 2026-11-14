package com.telibot.bridge;
import android.content.*;import android.database.sqlite.*;import android.database.Cursor;import android.security.keystore.*;import javax.crypto.*;import javax.crypto.spec.GCMParameterSpec;import android.util.Base64;import java.security.*;
final class Store extends SQLiteOpenHelper {
 Store(Context c){super(c,"receipts.db",null,2);}
 public void onCreate(SQLiteDatabase d){d.execSQL("CREATE TABLE receipts(id TEXT PRIMARY KEY, body TEXT NOT NULL, created INTEGER NOT NULL,attempted INTEGER NOT NULL DEFAULT 0)");}
 public void onUpgrade(SQLiteDatabase d,int old,int n){if(old<2)d.execSQL("ALTER TABLE receipts ADD COLUMN attempted INTEGER NOT NULL DEFAULT 0");}
 static void note(Context c,String stage,String message){prefs(c).edit().putString("last_"+stage,message).putLong("last_"+stage+"_at",System.currentTimeMillis()).apply();}
 static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences("settings",0);}
 static SecretKey key()throws Exception{KeyStore k=KeyStore.getInstance("AndroidKeyStore");k.load(null);if(!k.containsAlias("bridge")){KeyGenerator g=KeyGenerator.getInstance("AES","AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder("bridge",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes("GCM").setEncryptionPaddings("NoPadding").build());g.generateKey();}return (SecretKey)k.getKey("bridge",null);}
 static String seal(String s)throws Exception{Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());return Base64.encodeToString(c.getIV(),2)+":"+Base64.encodeToString(c.doFinal(s.getBytes("UTF-8")),2);}
 static String open(String s)throws Exception{String[]p=s.split(":",2);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(p[0],2)));return new String(c.doFinal(Base64.decode(p[1],2)),"UTF-8");}
 boolean add(String id,String body)throws Exception{SQLiteDatabase d=getWritableDatabase();d.delete("receipts","created < ?",new String[]{Long.toString(System.currentTimeMillis()-86400000L)});try(Cursor q=d.rawQuery("SELECT COUNT(*) FROM receipts",null)){q.moveToFirst();if(q.getInt(0)>=200)return false;}ContentValues v=new ContentValues();v.put("id",id);v.put("body",seal(body));v.put("created",System.currentTimeMillis());return d.insertWithOnConflict("receipts",null,v,SQLiteDatabase.CONFLICT_IGNORE)!=-1;}
}
