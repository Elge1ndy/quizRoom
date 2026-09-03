# 🚀 دليل النشر على Cloudflare Pages

> [!WARNING]
> **متطلبات Node.js**: Wrangler CLI يتطلب Node.js v20.0.0 أو أحدث. إذا كان لديك إصدار أقدم (مثل v18)، استخدم الطريقة البديلة عبر لوحة التحكم أو قم بتحديث Node.js أولاً.

## الخطوات السريعة

### 1️⃣ التحضير المحلي
قبل الرفع، تأكد من أن المشروع يعمل محلياً:
```bash
cd client
npm install
npm run build
```

### 2️⃣ الرفع باستخدام Wrangler CLI

#### تثبيت Wrangler (إذا لم يكن مثبتاً)
```bash
npm install -g wrangler
```

#### تسجيل الدخول إلى Cloudflare
```bash
wrangler login
```

#### نشر المشروع
```bash
wrangler pages deploy client/dist --project-name=quizroom
```

### 3️⃣ الرفع عبر لوحة تحكم Cloudflare Pages

1. **افتح [Cloudflare Dashboard](https://dash.cloudflare.com/)**
2. اذهب إلى **Workers & Pages**
3. انقر **Create Application** → **Pages** → **Upload Assets**
4. ارفع مجلد `client/dist` بعد بناءه

### 4️⃣ ربط مع GitHub (الطريقة الموصى بها)

1. **Push المشروع إلى GitHub** (إذا لم يكن مرفوعاً بعد)
2. في Cloudflare Dashboard → **Create Application** → **Pages** → **Connect to Git**
3. اختر مشروع QuizRoom من GitHub
4. **ضبط الإعدادات:**
   - **Build command**: `cd client && npm install && npm run build`
   - **Build output directory**: `client/dist`
   - **Root directory**: `/`
   - **Environment variables**:
     ```
     VITE_SUPABASE_URL=your-supabase-project-url
     VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
     ```

5. انقر **Save and Deploy**

### 5️⃣ متغيرات البيئة المطلوبة

يجب إضافة هذه المتغيرات في إعدادات Cloudflare Pages:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | رابط مشروع Supabase |
| `VITE_SUPABASE_ANON_KEY` | مفتاح Supabase العام (Anon Key) |

**طريقة إضافتها:**
1. افتح مشروعك في Cloudflare Pages
2. اذهب إلى **Settings** → **Environment Variables**
3. أضف المتغيرات أعلاه
4. انقر **Save**
5. أعد النشر (Re-deploy)

---

## 📝 ملاحظات مهمة

### 🔄 التحديثات التلقائية
عند الربط مع GitHub، كل `push` إلى `main` سيؤدي إلى نشر تلقائي

### 🌐 الدومين
بعد النشر، ستحصل على رابط مثل:
```
https://quizroom.pages.dev
```
يمكنك ربط دومين خاص من إعدادات **Custom Domains**

---

## 🛠️ استكشاف الأخطاء

### خطأ "متغيرات البيئة مفقودة"
- تأكد من إضافة `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY` في إعدادات Environment Variables
- أعد النشر بعد إضافتها

### خطأ في Build
- تأكد من أن `Build command` صحيح: `cd client && npm install && npm run build`
- تأكد من أن `Build output directory` هو: `client/dist`

### الصفحات لا تعمل (404)
- تأكد من وجود ملف `_redirects` في `client/dist` بعد البناء
- تحقق من أن Vite يقوم بنسخ الملف (قد تحتاج لإضافته في `vite.config.js`)

---

## 📦 الملفات المضافة

- **`wrangler.toml`**: إعدادات Wrangler CLI
- **`client/_redirects`**: لدعم React Router
- **`client/_headers`**: إعدادات الأمان والكاش
- **`DEPLOYMENT.md`**: هذا الدليل

---

**تم بواسطة:** Antigravity AI ⚡
