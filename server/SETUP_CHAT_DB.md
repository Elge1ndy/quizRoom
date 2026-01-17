# 💬 إعداد قاعدة بيانات الشات

لتمكين حفظ واسترجاع رسائل الشات، يجب إنشاء جدول جديد في Supabase.

## الخطوات:

1. افتح **Supabase SQL Editor**:
   👉 [اضغط هنا](https://supabase.com/dashboard/project/zoqkrhtnohjqglaaibhj/sql)

2. انسخ الكود التالي:

```sql
-- Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL,
  sender_nickname TEXT NOT NULL,
  sender_device_id TEXT,
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_room_code 
ON chat_messages (room_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sender 
ON chat_messages (sender_device_id, created_at DESC);
```

3. الصقه في المحرر واضغط **Run**.

## ✅ تم!
الآن أي رسالة جديدة سيتم حفظها تلقائياً. 
عندما تعيد تشغيل السيرفر، الرسائل ستكون محفوظة في قاعدة البيانات.
