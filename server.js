import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// HELPER: sestaví system prompt
// ─────────────────────────────────────────────
function buildSystemPrompt(subject, age) {
  return `
Jsi ŠikulAI – dětský AI tutor pro děti ve věku 6–15 let.

TVŮJ HLAVNÍ CÍL:
Vysvětluj učivo tak, aby dítě řeklo: "Aha, už to chápu!"

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

Aktuální věk dítěte: ${age} let

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

Aktuálně zvolený předmět: ${subject}

Porovnej dotaz s předmětem.

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

action_type = "practice"

Vždy vytvoř test:
- pokud age ≤ 8 → 3 otázky
- pokud age ≥ 9 → 5 otázek

Každá otázka musí mít přesně:
A)
B)
C)
D)

Na konci napiš: "Vyber u každé otázky jednu možnost."
Nikdy neuváděj správné odpovědi.

action_type = "evaluate_practice"

- vyhodnoť odpovědi (např. A,B,C,D)

Použij:
✔ správně
✖ špatně – správná odpověď je X, protože ...

Na konci:
- pokud vše správně: "Skvělá práce! Chválím tě za všechny správné odpovědi."
- pokud více než polovina správně: "Chválím tě za správné odpovědi."
- pokud méně než polovina správně: "Nevadí, některé odpovědi byly náročné. Pojďme si to zkusit znovu."

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
// HELPER: sestaví user message
// ─────────────────────────────────────────────
function buildUserMessage(message, actionType, context) {
  if (actionType === "evaluate_practice" && context) {
    return `Uživatel odpověděl na test: ${message}\n\nKontext testu:\n${context}`;
  }
  if (actionType && actionType !== "normal") {
    return `[action_type: ${actionType}]\n\n${message}`;
  }
  return message;
}

// ─────────────────────────────────────────────
// POST /ai-stream  →  streamuje čistý text
// ─────────────────────────────────────────────
app.post("/ai-stream", async (req, res) => {
  const {
    message,
    subject = "obecný",
    age = 10,
    action_type = "normal",
    context = null,
  } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Chybí message." });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      temperature: 0.5,
      stream: true,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(subject, age),
        },
        {
          role: "user",
          content: buildUserMessage(message, action_type, context),
        },
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) {
        res.write(text);
      }
    }

    res.end();
  } catch (err) {
    console.error("❌ /ai-stream error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chyba při generování odpovědi." });
    } else {
      res.end();
    }
  }
});

// ─────────────────────────────────────────────
// POST /ai-meta  →  vrací JSON metadata (akce, confidence)
// ─────────────────────────────────────────────
app.post("/ai-meta", async (req, res) => {
  const { message, subject = "obecný", age = 10 } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Chybí message." });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Jsi pomocný asistent. Na základě dotazu dítěte vrať JSON s těmito poli:
{
  "actions": ["explain_more", "example", "practice"],
  "confidence": 0.95,
  "image_query": "volitelný anglický výraz pro ilustrační obrázek nebo null"
}

Pravidla:
- actions vždy obsahuje právě tato 3 tlačítka: explain_more, example, practice
- confidence je číslo 0.0–1.0 podle toho, jak jasný je dotaz
- image_query je krátký anglický výraz vhodný pro vyhledání obrázku, nebo null
- Vracíš POUZE validní JSON, žádný jiný text.`,
        },
        {
          role: "user",
          content: `Předmět: ${subject}, věk: ${age}\nDotaz: ${message}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";
    let meta;
    try {
      meta = JSON.parse(raw);
    } catch {
      meta = { actions: ["explain_more", "example", "practice"], confidence: 0.8, image_query: null };
    }

    // Převod stringů na objekty { label, type } které frontend očekává
    const ACTION_LABELS = {
      explain_more: "Vysvětlit jinak",
      example: "Další příklad",
      practice: "Procvičit",
    };

    const actions = (meta.actions || ["explain_more", "example", "practice"]).map((a) => {
      if (typeof a === "string") {
        return { type: a, label: ACTION_LABELS[a] || a };
      }
      return a; // už je objekt, ponech
    });

    res.json({
      actions,
      confidence: meta.confidence ?? 0.9,
      image_query: meta.image_query ?? null,
    });
  } catch (err) {
    console.error("❌ /ai-meta error:", err.message);
    res.status(500).json({ error: "Chyba při generování metadat." });
  }
});

// ─────────────────────────────────────────────
// POST /api/sikulai-tts  →  OpenAI TTS → base64 MP3
// ─────────────────────────────────────────────
app.post("/api/sikulai-tts", async (req, res) => {
  const { text, emotion = "neutral", age = 10 } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Chybí text." });
  }

  // Emotion → voice mapping
  const voiceMap = {
    neutral: "nova",
    happy: "shimmer",
    thinking: "nova",
    excited: "shimmer",
  };
  const voice = voiceMap[emotion] || "nova";

  // Věková adaptace rychlosti
  let speed = 1.0;
  if (age <= 8) speed = 0.85;
  else if (age <= 11) speed = 0.95;
  else speed = 1.0;

  // Emotion prefix pro přirozenější intonaci
  const prefixMap = {
    happy: "Radostně: ",
    thinking: "Zamyšleně: ",
    excited: "Nadšeně: ",
  };
  const prefix = prefixMap[emotion] || "";
  const finalText = prefix + text;

  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice,
      input: finalText,
      speed: speed,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    const audioBase64 = buffer.toString("base64");

    res.json({
      audioBase64,
      voiceUsed: voice,
      emotionApplied: emotion,
    });
  } catch (err) {
    console.error("❌ /api/sikulai-tts error:", err.message);
    res.status(500).json({ error: "Chyba při generování hlasu." });
  }
});

// ─────────────────────────────────────────────
// GET /health  →  Railway health check
// ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "ŠikulAI Gateway" });
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ ŠikulAI Gateway běží na portu ${PORT}`);
});