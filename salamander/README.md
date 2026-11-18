# Salamander Digital Museum

Footwear uchun 3D onlayn muzey: Three.js viewer + inspector, admin panel (GLB/glTF yuklash), har bir model uchun avtomatik QR kod.
Backend: **Supabase** (baza + doimiy cloud storage + admin login). Frontend: build talab qilmaydi (oddiy HTML/JS), istalgan static hostingda ishlaydi.

## Papkalar

```
index.html          sayt qobig'i (header, drawer, search, footer)
config.js           <-- SHU YERNI TO'LDIRASIZ (Supabase URL, anon key, SITE_URL)
css/style.css       dizayn (light theme, mobile-first)
js/app.js           router va barcha ommaviy sahifalar
js/viewer.js        3D viewer: orbit/pan/zoom, help, inspector, fullscreen, VR
js/admin.js         admin: login, yuklash, preview, publish, QR boshqaruvi
js/api.js, util.js  Supabase so'rovlari, QR generator, yordamchi funksiyalar
supabase/schema.sql baza jadvallari + xavfsizlik (RLS) + storage policy
_redirects, vercel.json   /models/xxx kabi to'g'ridan-to'g'ri linklar uchun
```

## 1. Supabase sozlash (10 daqiqa, bepul)

1. https://supabase.com da yangi **Project** oching.
2. **SQL Editor → New query** ga `supabase/schema.sql` ichidagi hamma narsani qo'ying → **Run**.
   Bu jadvallar, kategoriyalar (8 ta), `museum` storage bucket va xavfsizlik qoidalarini yaratadi.
3. **Authentication → Users → Add user**: o'zingizning email va parolingiz (**Auto Confirm User** ni yoqing).
4. **Authentication → Sign In / Providers → Email**: **"Allow new users to sign up"** ni **o'chiring** (begona odam ro'yxatdan o'ta olmasin).
5. SQL Editor da yana bir marta ishga tushiring (o'z emailingizni yozing):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'SIZNING_EMAIL';
   ```
   Faqat shu jadvaldagi foydalanuvchi yuklash/tahrirlash/o'chirish qila oladi.
6. **Project Settings → API**: `Project URL` va `anon public` key ni nusxalang → `config.js` ga qo'ying.
   ⚠️ `service_role` kalitini hech qachon qo'ymang.
7. Fayl hajmi: bepul planda 50 MB/fayl. Katta modellar uchun **Storage → Settings** da limitni oshiring (paid plan) va `config.js` dagi `MAX_FILE_MB` ni moslang.

## 2. Deploy (haqiqiy domen kerak — QR shunga bog'lanadi)

**Netlify (eng oson):** https://app.netlify.com/drop ga `salamander` papkasini tashlang. `_redirects` fayli avtomatik ishlaydi.
**Vercel:** papkani GitHub ga yuklab import qiling (`vercel.json` tayyor).

Deploydan keyin:
1. Saytingiz manzilini (masalan `https://salamander-museum.netlify.app` yoki o'z domeningiz) `config.js` dagi **`SITE_URL`** ga yozing va qayta deploy qiling.
2. Sayt `localhost` yoki lokal IP da ochilsa, QR kodlar **ataylab o'chirilgan** (ogohlantirish chiqadi) — xato QR chop etilmasligi uchun.

## 3. Ishlatish

- Admin: `https://SIZNING-SAYT/admin` → login → **Upload New 3D Model**.
- `.glb` — bitta fayl. `.gltf` — `.bin` va teksturalar bilan **birga tanlang** yoki hammasini **bitta ZIP** qilib yuklang. Yetishmayotgan fayl bo'lsa, tizim aytadi.
- Yuklashdan oldin viewer da ko'rib chiqing, thumbnail uchun "Use current 3D view" ni bosing.
- **Save as Draft** — saytda ko'rinmaydi. **Publish** — darrov ochiladi va QR tayyor bo'ladi (PNG/SVG yuklab olish).
- Har modelning doimiy manzili: `/models/oxford-shoe-001`. Nom o'zgarsa ham manzil va QR o'zgarmaydi.
- QR kodlar: model sahifasida, admin → **QR codes** tabida (bosh sahifa, kategoriyalar, hamma modellar).
- Sinash uchun bepul shoe model: Khronos "MaterialsVariantsShoe" (glTF-Sample-Assets, GitHub) yoki Sketchfab dan o'zingiz yuklagan GLB.

## 4. Viewer boshqaruvi

Desktop: chap tugma – aylantirish, o'ng tugma – siljitish, g'ildirak – zoom, double-click – nuqtaga zoom.
Telefon: 1 barmoq – aylantirish, 2 barmoq – siljitish, chimdish – zoom, double-tap – zoom.
Klaviatura: `1` Render, `2` Materials, `3` Geometry, `4` UV (qayta bossangiz keyingi variantga o'tadi), `5` Wireframe, `I` Inspector, `R` kamerani tiklash.
Modelda yo'q kanal (masalan AO xaritasi) inspectorda "Unavailable" deb ko'rsatiladi.
iPhone Safari element-fullscreen ni qo'llamaydi, shuning uchun u yerda to'liq ekranli rejim sahifa ichida ochiladi.

## 5. Test holati (halol hisobot)

Tekshirildi:
- Barcha JS fayllar sintaksis tekshiruvidan o'tdi.
- Telefon o'lchamidagi brauzerda (soxta backend bilan) bosh sahifa, drawer menyu, qidiruv, kategoriya, model sahifasi (QR manzili `SITE_URL + /models/<id>`), admin login oynasi va 404 sahifa xatosiz ochildi.

**Hali tekshirilmagan** (menda internet/Supabase kalitlari yo'q edi, shuning uchun siz deploydan keyin tekshirishingiz kerak):
- Haqiqiy GLB/glTF ning 3D viewer da ko'rinishi, orbit/zoom/pan, inspector rejimlari, fullscreen, VR.
- Haqiqiy Supabase bilan yuklash, publish, login, saqlanib qolishi.
- QR ni telefon kamerasi bilan skanerlash.
Birinchi deploydan keyin shu 3 ta guruhni sinab chiqing; muammo chiqsa, xato matnini yuboring — tuzataman.

## 6. Ma'lum cheklovlar

- **Users** tabi qo'shilmagan (foydalanuvchi profillari yo'q — talabda "faqat profillar bo'lsa" deyilgan).
- Contact formasi email ilovangizni ochadi (serversiz); haqiqiy forma uchun keyinroq Edge Function qo'shish mumkin.
- Ijtimoiy tarmoqda link preview (og:image) JS orqali qo'yiladi, ko'p crawlerlar buni ko'rmaydi.
- Inspector: skin/animatsiyali modellar va 2-UV kanalidagi teksturalar uchun kanal ko'rinishi cheklangan.
- Sahifalar CDN dan (jsdelivr) Three.js, Supabase, JSZip yuklaydi; internet kerak. Xohlasangiz keyin o'zingizning serverga ko'chirib beraman.
