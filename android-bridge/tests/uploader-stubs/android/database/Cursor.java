package android.database;public interface Cursor extends AutoCloseable {boolean moveToNext();boolean moveToFirst();String getString(int i);int getInt(int i);void close();}
