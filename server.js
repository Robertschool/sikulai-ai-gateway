import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { Resend } from "resend";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://your-app.base44.com";

// ─────────────────────────────────────────────
// HELPER: Action labels (CZ)
// ─────────────────────────────────────────────
const ACTION_LABELS = {
  explain_more: "Vysvětlit jinak",
  example: "Další příklad",
  practice: "Procvičit",
};

// ─────────────────────────────────────────────
// HELPER: Build user message for action types
// ─────────────────────────────────────────────
function buildUserMessage(message, action_type, context) {
  if (action_type === "normal") return message;
  if (action_type === "explain_more") return `Vysvětli mi to jinak. Kontext: ${context || message}`;
  if (action_type === "example") return `Dej mi nový příklad. Kontext: ${context || message}`;
  if (action_type === "practice") return `Vytvoř mi test na toto téma: ${context || message}`;
  if (action_type === "evaluate_practice") return message;
  return message;
}

// ─────────────────────────────────────────────
// HELPER: Build system prompt
// ─────────────────────────────────────────────
function buildSystemPrompt(subject, age) {
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

Zvolený předmět je: ${subject}

Odmítni odpovědět POUZE tehdy, pokud dotaz JEDNOZNAČNĚ patří do úplně jiného předmětu.

✅ Příklady kdy ODPOVÍDÁŠ normálně (neodmítej):
- subject = "dějepis", dotaz = "kdo je karel 4" → ODPOVĚZ (Karel IV. je historická osobnost)
- subject = "dějepis", dotaz = "co je renesance" → ODPOVĚZ
- subject = "dějepis", dotaz = "kdy byla první světová válka" → ODPOVĚZ
- subject = "přírodopis", dotaz = "jak se množí ryby" → ODPOVĚZ
- subject = "zeměpis", dotaz = "kde leží Francie" → ODPOVĚZ
- subject = "matematika", dotaz = "co je trojúhelník" → ODPOVĚZ
- subject = "fyzika", dotaz = "proč padají věci dolů" → ODPOVĚZ

❌ Příklady kdy odmítneš (jednoznačná neshoda):
- subject = "matematika", dotaz = "kdo byl Karel IV." → odmítni
- subject = "angličtina", dotaz = "vysvětli fotosyntézu" → odmítni
- subject = "dějepis", dotaz = "jak se počítá obsah kruhu" → odmítni

Pokud máš sebemenší pochybnost → ODPOVĚZ. Odmítej jen při naprosto jasné neshodě.

Pokud dotaz skutečně nepatří do zvoleného předmětu, napiš přesně:

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

Vždy vytvoř test. Formát musí být PŘESNĚ takto:

1. [Text otázky]
A) [možnost]
B) [možnost]
C) [možnost]
D) [možnost]

2. [Text otázky]
A) [možnost]
B) [možnost]
C) [možnost]
D) [možnost]

Pravidla:
- pokud age ≤ 8 → 3 otázky
- pokud age ≥ 9 → 5 otázek
- každá otázka má VŽDY přesně 4 možnosti: A) B) C) D)
- číslo otázky a tečka, pak mezera, pak text
- žádné prázdné řádky mezi otázkou a možnostmi
- na konci napiš: "Vyber u každé otázky jednu možnost."
- NIKDY neuváděj správné odpovědi

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
// HELPER: Build meta prompt (for /ai-meta)
// ─────────────────────────────────────────────
function buildMetaPrompt(subject, age) {
  return `
Jsi pomocný agent pro aplikaci ŠikulAI.

Na základě tématu konverzace vrať JSON objekt s tímto formátem:
{
  "actions": ["explain_more", "example", "practice"],
  "wikipedia_cs": "Název článku na české Wikipedii (nebo null)",
  "wikipedia_en": "Article name on English Wikipedia (nebo null)"
}

Pravidla:
- actions vždy obsahuje právě tyto 3 hodnoty: explain_more, example, practice
- wikipedia_cs: název článku v češtině, přesně jak je na cs.wikipedia.org, nebo null
- wikipedia_en: název článku v angličtině přesně jak je na en.wikipedia.org, nebo null
- Vrať POUZE čistý JSON, žádný jiný text, žádné markdown bloky.
`;
}

// ─────────────────────────────────────────────
// HELPER: Generate verification token
// ─────────────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ─────────────────────────────────────────────
// ENDPOINT: GET /health
// ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "sikulai-ai-gateway" });
});

// ─────────────────────────────────────────────
// ENDPOINT: POST /ai-stream
// ─────────────────────────────────────────────
app.post("/ai-stream", async (req, res) => {
  const {
    message,
    subject = "obecné",
    age = 10,
    action_type = "normal",
    context = null,
    history = [],
  } = req.body;

  if (!message && action_type === "normal") {
    return res.status(400).json({ error: "Zpráva nesmí být prázdná." });
  }

  try {
    const systemPrompt = buildSystemPrompt(subject, age);
    const userMessage = buildUserMessage(message, action_type, context);

    const recentHistory = history.slice(-6).map((h) => ({
      role: h.role,
      content: h.content,
    }));

    const messages = [
      { role: "system", content: systemPrompt },
      ...recentHistory,
      { role: "user", content: userMessage },
    ];

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      stream: true,
      max_tokens: 1000,
      temperature: 0.7,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(text);
    }

    res.end();
  } catch (error) {
    console.error("❌ /ai-stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chyba při generování odpovědi." });
    } else {
      res.end();
    }
  }
});

// ─────────────────────────────────────────────
// ENDPOINT: POST /ai-meta
// ─────────────────────────────────────────────
app.post("/ai-meta", async (req, res) => {
  const {
    message,
    subject = "obecné",
    age = 10,
    context = null,
  } = req.body;

  try {
    const systemPrompt = buildMetaPrompt(subject, age);
    const userMessage = `Předmět: ${subject}. Téma dotazu: ${context || message}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content || "{}";

    let parsed;
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { actions: ["explain_more", "example", "practice"], wikipedia_cs: null, wikipedia_en: null };
    }

    const actions = (parsed.actions || ["explain_more", "example", "practice"]).map((a) => ({
      type: a,
      label: ACTION_LABELS[a] || a,
    }));

    const source_url = parsed.wikipedia_cs
      ? `https://cs.wikipedia.org/wiki/${encodeURIComponent(parsed.wikipedia_cs.replace(/ /g, "_"))}`
      : null;

    res.json({
      actions,
      source_url,
      source_label: parsed.wikipedia_cs || null,
      wikipedia_en: parsed.wikipedia_en || null,
    });
  } catch (error) {
    console.error("❌ /ai-meta error:", error);
    res.status(500).json({ error: "Chyba při generování metadat." });
  }
});

// ─────────────────────────────────────────────
// ENDPOINT: POST /api/sikulai-tts
// ─────────────────────────────────────────────
app.post("/api/sikulai-tts", async (req, res) => {
  const { text, emotion = "neutral", age = 10 } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text nesmí být prázdný." });
  }

  const voiceMap = {
    neutral: "nova",
    happy: "shimmer",
    thinking: "nova",
    excited: "shimmer",
  };

  const prefixMap = {
    happy: "Radostně: ",
    thinking: "Zamyšleně: ",
    excited: "Nadšeně: ",
    neutral: "",
  };

  let speed = 1.0;
  if (age <= 8) speed = 0.85;
  else if (age <= 11) speed = 0.95;
  else speed = 1.0;

  const voice = voiceMap[emotion] || "nova";
  const prefix = prefixMap[emotion] || "";
  const finalText = prefix + text;

  try {
    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: finalText,
      speed,
    });

    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    const audioBase64 = buffer.toString("base64");

    res.json({
      audioBase64,
      voiceUsed: voice,
      emotionApplied: emotion,
    });
  } catch (error) {
    console.error("❌ /api/sikulai-tts error:", error);
    res.status(500).json({ error: "Chyba při generování hlasu." });
  }
});

// ─────────────────────────────────────────────
// ENDPOINT: POST /email/send-verification
// ─────────────────────────────────────────────
app.post("/email/send-verification", async (req, res) => {
  const { parentEmail, childName } = req.body;

  if (!parentEmail || !childName) {
    return res.status(400).json({ error: "parentEmail a childName jsou povinné." });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const verifyUrl = `${APP_URL}/verify?token=${token}`;

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: parentEmail,
      subject: `Ověřte účet ${childName} v ŠikulAI`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #6B46C1;">Vítejte v ŠikulAI! 👋</h2>
          <p>Dobrý den,</p>
          <p>pro aktivaci účtu vašeho dítěte <strong>${childName}</strong> prosím klikněte na tlačítko níže:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}"
               style="background-color: #6B46C1; color: white; padding: 14px 28px;
                      text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
              Ověřit účet
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Odkaz je platný 48 hodin.</p>
          <p style="color: #666; font-size: 14px;">Pokud jste o registraci nevěděli, tento email ignorujte.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">ŠikulAI – chytrý pomocník pro školáky</p>
        </div>
      `,
    });

    res.json({ success: true, token, expiresAt });
  } catch (error) {
    console.error("❌ /email/send-verification error:", error);
    res.status(500).json({ error: "Chyba při odesílání emailu." });
  }
});

// ─────────────────────────────────────────────
// ENDPOINT: POST /email/resend-verification
// ─────────────────────────────────────────────
app.post("/email/resend-verification", async (req, res) => {
  const { parentEmail, childName } = req.body;

  if (!parentEmail || !childName) {
    return res.status(400).json({ error: "parentEmail a childName jsou povinné." });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const verifyUrl = `${APP_URL}/verify?token=${token}`;

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: parentEmail,
      subject: `Nový ověřovací odkaz pro ${childName} – ŠikulAI`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #6B46C1;">Nový ověřovací odkaz 🔗</h2>
          <p>Dobrý den,</p>
          <p>posíláme vám nový ověřovací odkaz pro účet <strong>${childName}</strong>:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}"
               style="background-color: #6B46C1; color: white; padding: 14px 28px;
                      text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
              Ověřit účet
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Odkaz je platný 48 hodin.</p>
          <p style="color: #666; font-size: 14px;">Předchozí odkaz byl zneplatněn.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">ŠikulAI – chytrý pomocník pro školáky</p>
        </div>
      `,
    });

    res.json({ success: true, token, expiresAt });
  } catch (error) {
    console.error("❌ /email/resend-verification error:", error);
    res.status(500).json({ error: "Chyba při odesílání emailu." });
  }
});

// ─────────────────────────────────────────────
// ENDPOINT: POST /email/send-welcome
// ─────────────────────────────────────────────
app.post("/email/send-welcome", async (req, res) => {
  const { parentEmail, childName } = req.body;

  if (!parentEmail || !childName) {
    return res.status(400).json({ error: "parentEmail a childName jsou povinné." });
  }

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: parentEmail,
      subject: `${childName} je připraven učit se s ŠikulAI! 🎉`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #6B46C1;">Účet byl úspěšně ověřen! 🎉</h2>
          <p>Dobrý den,</p>
          <p>účet vašeho dítěte <strong>${childName}</strong> byl úspěšně ověřen.</p>
          <p>${childName} se nyní může začít učit s ŠikulAI – chytrým AI asistentem pro školáky!</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${APP_URL}"
               style="background-color: #6B46C1; color: white; padding: 14px 28px;
                      text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
              Spustit ŠikulAI
            </a>
          </div>
          <div style="background: #F3F0FF; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; font-weight: bold; color: #6B46C1;">Co ŠikulAI umí:</p>
            <ul style="color: #444; margin: 8px 0;">
              <li>Vysvětluje učivo jednoduše a srozumitelně</li>
              <li>Přizpůsobuje se věku dítěte</li>
              <li>Procvičuje látku pomocí testů</li>
              <li>Bezpečné prostředí bez reklam</li>
            </ul>
          </div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">ŠikulAI – chytrý pomocník pro školáky</p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("❌ /email/send-welcome error:", error);
    res.status(500).json({ error: "Chyba při odesílání uvítacího emailu." });
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ ŠikulAI Gateway běží na portu ${PORT}`);
});