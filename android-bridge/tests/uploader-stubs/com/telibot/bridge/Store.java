package com.telibot.bridge;
import android.content.*;import android.database.Cursor;import java.util.*;
final class Store implements AutoCloseable {
 static final LinkedHashMap<String,String> rows=new LinkedHashMap<>();static final SharedPreferences prefs=new SharedPreferences();static String note="";
 Store(Context c){}static SharedPreferences prefs(Context c){return prefs;}static String open(String value){return value;}static void note(Context c,String stage,String message){note=message;}
 Store getWritableDatabase(){return this;}Store getReadableDatabase(){return this;}
 int delete(String table,String where,String[] args){if(where.equals("id=?"))return rows.remove(args[0])==null?0:1;return 0;}
 void execSQL(String sql,Object[] args){}
 Cursor rawQuery(String sql,String[] args){boolean count=sql.contains("COUNT(*)");List<Map.Entry<String,String>> snapshot=new ArrayList<>(rows.entrySet());return new Cursor(){int index=-1;public boolean moveToNext(){index++;return index<snapshot.size();}public boolean moveToFirst(){index=0;return count||!snapshot.isEmpty();}public String getString(int column){return column==0?snapshot.get(index).getKey():snapshot.get(index).getValue();}public int getInt(int column){return snapshot.size();}public void close(){}};}
 public void close(){}
}
