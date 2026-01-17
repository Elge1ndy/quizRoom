# 🎯 تعليمات إنشاء قاعدة البيانات

## الخطوة 1: افتح Supabase SQL Editor

1. اذهب إلى [مشروعك في Supabase](https://zoqkrhtnohjqglaaibhj.supabase.co)
2. من القائمة الجانبية، اختر **SQL Editor** (أيقونة </> )
3. اضغط **+ New Query**

## الخطوة 2: انسخ والصق الكود التالي

```sql
-- QuizRoom Database Schema

CREATE TABLE IF NOT EXISTS players (
  device_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  avatar TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_nickname_lower 
ON players (LOWER(nickname));

CREATE INDEX IF NOT EXISTS idx_players_last_seen 
ON players (last_seen DESC);
```

## الخطوة 3: شغّل الكود

1. اضغط **Run** (أو Ctrl+Enter)
2. يجب أن تظهر رسالة: `Success. No rows returned`

## الخطوة 4: تحقق من الجدول

1. من القائمة الجانبية، اختر **Table Editor**
2. يجب أن ترى جدول `players` في القائمة
3. اضغط عليه لترى الأعمدة

## ✅ جاهز للاستخدام!

بعد تنفيذ هذه الخطوات، قاعدة البيانات ستكون جاهزة.
