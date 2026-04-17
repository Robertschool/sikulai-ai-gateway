import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import crypto from 'crypto';
import { Resend } from 'resend';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM || 'ŠikulAI <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || 'https://sikulai.com';

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────
// ACTION LABELS
// ─────────────────────────────────────────────

const ACTION_LABELS = {
  explain_more: 'Vysvětlit jinak',
  example: 'Další příklad',
  practice: 'Procvičit',
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function buildUserMessage({ message, action_type, context }) {
  if (action_type === 'explain_more') {
    return context
      ? `Vysvětli mi jinak a jiným příkladem toto téma: ${context}`
      : 'Vysvětli mi to jinak a použij jiný příklad.';
  }
  if (action_type === 'example') {
    return context
      ? `Dej mi další konkrétní příklad na toto téma: ${context}`
      : 'Dej mi další příklad.';
  }
  if (action_type === 'practice') {
    return context
      ? `Vytvoř mi test na toto téma: ${context}`
      : 'Vytvoř mi test na toto téma.';
  }
  if (action_type === 'evaluate_practice') {
    return message;
  }
  return message;
}

function getSystemPrompt(subject, age) {
  return `
Jsi ŠikulAI – dětský AI tutor pro děti ve věku 6–15 let.

TVŮJ HLAVNÍ CÍL:
Vysvětluj učivo tak, aby dítě řeklo:
"Aha, už to chápu!"

--------------------------------------------------

🔒 FORMÁT ODPOVĚDI

- Vracíš pouze čistý text.
- Nikdy nevypisuj JSON.
- Nikdy nevypisuj metadata.
- Nikdy nevysvětluj, jak odpověď vznikla.

--------------------------------------------------

🧠 DIDAKTICKÁ PRAVIDLA (KRITICKÉ)

VŽDY:
- začni konkrétním příkladem ze života dítěte (škola, zvířata, jídlo, hra)
- vysvětli na něm princip
- používej jednoduché věty
- přidej alespoň 2 příklady

NIKDY:
- nezačínej definicí (např. "X je proces", "X je kategorie")
- nepoužívej složitá slova bez vysvětlení
- nedělej pouhý výpis informací

--------------------------------------------------

🧩 NAVÁDĚNÍ (Scaffolding – VELMI DŮLEŽITÉ)

Pokud je to vhodné:
- polož krátkou jednoduchou otázku, která dítě navede k přemýšlení
- pomoz mu dojít k odpovědi

Používej např.:
"Myslíš, že to je ten, kdo něco dělá, nebo ten, komu se to děje?"
"Kdo je v té větě hlavní?"

Nikdy ale nepokládej příliš složité otázky.

--------------------------------------------------

👶 VĚKOVÁ ADAPTACE

Pokud age ≤ 8:
- velmi jednoduché věty
- max 3–4 věty
- žádné odborné pojmy
- vysvětluj hravě

Pokud age 9–11:
- vysvětluj krok po kroku
- použij 2–3 příklady

Pokud age ≥ 12:
- můžeš přidat hlubší vysvětlení
- vysvětli i "proč to tak je"

--------------------------------------------------

📚 KONTROLA PŘEDMĚTU (VELMI DŮLEŽITÉ)

Porovnej dotaz s předmětem (subject).

Pokud dotaz NEPATŘÍ do zvoleného předmětu:
- NEVYSVĚTLUJ učivo
- napiš přesně:

"Tohle patří do jiného předmětu 😊
Teď máš zvolený předmět: ${subject}
Zkus si prosím přepnout na správný předmět a pak se zeptej znovu."

A dál už nepokračuj.

--------------------------------------------------

🎯 STRUKTURA VYSVĚTLENÍ

Používej tento postup:

1. jednoduchý příklad
2. vysvětlení na příkladu
3. krátké shrnutí

Pokud je to vhodné:
- vlož krátkou naváděcí otázku pro dítě

--------------------------------------------------

🗣️ STYL KOMUNIKACE

- mluv jako hodný učitel
- buď přátelský a podporující
- používej přirozený jazyk
- nebuď formální ani akademický

--------------------------------------------------

🔁 CHOVÁNÍ PODLE action_type

action_type = "normal"
- vysvětli téma jednoduše pomocí příkladů

action_type = "explain_more"
- vysvětli jinak než předtím
- použij jiný příklad

action_type = "example"
- dej nový konkrétní příklad
- vysvětli ho krok po kroku

--------------------------------------------------

action_type = "practice"

Vždy vytvoř test:

- pokud age ≤ 8 → 3 otázky
- pokud age ≥ 9 → 5 otázek

Každá otázka musí mít PŘESNĚ tento formát:

1. Text otázky
A) možnost
B) možnost
C) možnost
D) možnost

2. Text otázky
A) možnost
B) možnost
C) možnost
D) možnost

Na konci napiš:
"Vyber u každé otázky jednu možnost."

Nikdy neuváděj správné odpovědi.

--------------------------------------------------

action_type = "evaluate_practice"

- vyhodnoť odpovědi (např. A,B,C,D)

Použij:

✔ správně
✖ špatně – správná odpověď je X, protože ...

Na konci:

- pokud vše správně:
"Skvělá práce! Chválím tě za všechny správné odpovědi."

- pokud více než polovina správně:
"Chválím tě za správné odpovědi."

- pokud méně než polovina správně:
"Nevadí, některé odpovědi byly náročné. Pojďme si to zkusit znovu."

--------------------------------------------------

🧪 INTERNÍ KONTROLA KVALITY (NEZOBRAZUJ)

Před odesláním odpovědi si zkontroluj:

- Je to pochopitelné pro daný věk?
- Obsahuje to příklad?
- Není to definice?
- Je jazyk jednoduchý?

Pokud ne → odpověď zjednoduš.

--------------------------------------------------

🎯 FINÁLNÍ PRAVIDLO

Každá odpověď musí být:
- jednoduchá
- srozumitelná
- vysvětlující

Cílem je pochopení, ne odborná přesnost.
`;
}

// ─────────────────────────────────────────────
// AI STREAM
// ─────────────────────────────────────────────

app.post('/ai-stream', async (req, res) => {
  const {
    message,
    subject,
    age,
    action_type = 'normal',
    context = null,
    history = [],
  } = req.body;

  if (!subject || !age) {
    return res.status(400).json({ error: 'Chybí subject nebo age' });
  }
  if (action_type === 'normal' && !message) {
    return res.status(400).json({ error: 'Chybí message' });
  }

  const userMessage = buildUserMessage({ message, action_type, context });

  const recentHistory = history.slice(-6).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      temperature: 0.7,
      stream: true,
      messages: [
        { role: 'system', content: getSystemPrompt(subject, age) },
        ...recentHistory,
        { role: 'user', content: userMessage },
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(text);
    }

    res.end();
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).end('Chyba při generování odpovědi.');
  }
});

// ─────────────────────────────────────────────
// AI META
// ─────────────────────────────────────────────

app.post('/ai-meta', async (req, res) => {
  const { message, subject, age, action_type = 'normal' } = req.body;

  if (!subject || !age) {
    return res.status(400).json({ error: 'Chybí subject nebo age' });
  }

  const metaPrompt = `
Na základě tématu "${message || subject}" v předmětu "${subject}" pro dítě věku ${age} let vrať JSON:
{
  "actions": ["explain_more", "example", "practice"],
  "wikipedia_cs": "Název článku na české Wikipedii (nebo null)",
  "wikipedia_en": "Article name on English Wikipedia (nebo null)"
}
Vrať pouze JSON, nic jiného.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: metaPrompt }],
    });

    const raw = JSON.parse(completion.choices[0].message.content);

    const actions = (raw.actions || ['explain_more', 'example', 'practice']).map(
      (type) => ({ type, label: ACTION_LABELS[type] || type })
    );

    const wikiCs = raw.wikipedia_cs || null;
    const wikiEn = raw.wikipedia_en || null;

    res.json({
      actions,
      source_url: wikiCs ? `https://cs.wikipedia.org/wiki/${encodeURIComponent(wikiCs)}` : null,
      source_label: wikiCs,
      wikipedia_en: wikiEn,
    });
  } catch (err) {
    console.error('Meta error:', err);
    res.json({
      actions: Object.entries(ACTION_LABELS).map(([type, label]) => ({ type, label })),
      source_url: null,
      source_label: null,
      wikipedia_en: null,
    });
  }
});

// ─────────────────────────────────────────────
// TTS
// ─────────────────────────────────────────────

const EMOTION_VOICE = {
  neutral: 'nova',
  happy: 'shimmer',
  thinking: 'nova',
  excited: 'shimmer',
};

const EMOTION_PREFIX = {
  happy: 'Radostně: ',
  thinking: 'Zamyšleně: ',
  excited: 'Nadšeně: ',
};

function getSpeed(age) {
  if (age <= 8) return 0.85;
  if (age <= 11) return 0.95;
  return 1.0;
}

app.post('/api/sikulai-tts', async (req, res) => {
  const { text, emotion = 'neutral', age = 10 } = req.body;

  if (!text) return res.status(400).json({ error: 'Chybí text' });

  const voice = EMOTION_VOICE[emotion] || 'nova';
  const prefix = EMOTION_PREFIX[emotion] || '';
  const speed = getSpeed(age);
  const input = prefix + text;

  try {
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input,
      speed,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    const audioBase64 = buffer.toString('base64');

    res.json({ audioBase64, voiceUsed: voice, emotionApplied: emotion });
  } catch (err) {
    console.error('TTS error:', err);
    res.status(500).json({ error: 'TTS se nepodařilo vygenerovat' });
  }
});

// ─────────────────────────────────────────────
// EMAIL – ŠABLONY
// ─────────────────────────────────────────────

function verificationTemplate({ childName, verifyUrl }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;color:#222;background:#fff">
  <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">Potvrďte registraci ${childName}</h2>
  <p style="color:#555;line-height:1.6;margin-bottom:24px">
    Někdo (pravděpodobně vy) zaregistroval účet pro <strong>${childName}</strong> na ŠikulAI –
    vzdělávacím AI asistentovi pro děti ve věku 6–15 let.
    Kliknutím na tlačítko níže aktivujete účet.
  </p>
  <a href="${verifyUrl}"
     style="display:inline-block;background:#6c47e8;color:#fff;text-decoration:none;
            padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">
    Potvrdit registraci
  </a>
  <p style="color:#888;font-size:13px;margin-top:24px;line-height:1.5">
    Odkaz je platný 48 hodin.<br>
    Pokud jste registraci nezahajovali, tento email ignorujte.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
  <p style="color:#aaa;font-size:12px;margin:0">ŠikulAI · Vzdělávání pro děti 6–15 let</p>
</body>
</html>`;
}

function welcomeTemplate({ childName }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;color:#222;background:#fff">
  <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">
    ${childName} může začít!
  </h2>
  <p style="color:#555;line-height:1.6;margin-bottom:24px">
    Účet byl úspěšně ověřen. ${childName} teď může používat ŠikulAI
    k procvičování látky, pokládání otázek a přípravě na školu.
  </p>
  <a href="${APP_URL}"
     style="display:inline-block;background:#6c47e8;color:#fff;text-decoration:none;
            padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">
    Otevřít ŠikulAI
  </a>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
  <p style="color:#aaa;font-size:12px;margin:0">ŠikulAI · Vzdělávání pro děti 6–15 let</p>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// EMAIL – ENDPOINTY
// ─────────────────────────────────────────────

// Odeslání verifikačního emailu
// Base44 zavolá hned po vytvoření uživatele v DB
// Vrátí token + expiresAt → Base44 si je uloží do DB
app.post('/email/send-verification', async (req, res) => {
  const { parentEmail, childName } = req.body;

  if (!parentEmail || !childName) {
    return res.status(400).json({ error: 'Chybí parentEmail nebo childName' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const verifyUrl = `${APP_URL}/verify?token=${token}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: parentEmail,
      subject: `Potvrďte registraci ${childName} na ŠikulAI`,
      html: verificationTemplate({ childName, verifyUrl }),
    });

    res.json({ success: true, token, expiresAt });
  } catch (err) {
    console.error('Verification email error:', err);
    res.status(500).json({ error: 'Email se nepodařilo odeslat', detail: err.message });
  }
});

// Opětovné odeslání verifikace (resend tlačítko)
app.post('/email/resend-verification', async (req, res) => {
  const { parentEmail, childName } = req.body;

  if (!parentEmail || !childName) {
    return res.status(400).json({ error: 'Chybí parentEmail nebo childName' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const verifyUrl = `${APP_URL}/verify?token=${token}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: parentEmail,
      subject: `Potvrďte registraci ${childName} na ŠikulAI`,
      html: verificationTemplate({ childName, verifyUrl }),
    });

    res.json({ success: true, token, expiresAt });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Email se nepodařilo odeslat', detail: err.message });
  }
});

// Uvítací email – Base44 zavolá po úspěšné verifikaci tokenu
app.post('/email/send-welcome', async (req, res) => {
  const { parentEmail, childName } = req.body;

  if (!parentEmail || !childName) {
    return res.status(400).json({ error: 'Chybí parentEmail nebo childName' });
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: parentEmail,
      subject: `${childName} je připraven/a učit se na ŠikulAI!`,
      html: welcomeTemplate({ childName }),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Welcome email error:', err);
    res.status(500).json({ error: 'Email se nepodařilo odeslat', detail: err.message });
  }
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`ŠikulAI server running on port ${PORT}`);
});