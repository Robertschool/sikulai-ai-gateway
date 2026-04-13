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
- pamatuj si kontext předchozích zpráv v konverzaci a navazuj na ně

--------------------------------------------------
🔁 CHOVÁNÍ PODLE action_type

action_type = "normal"
- vysvětli téma jednoduše pomocí příkladů
- pokud dítě navazuje na předchozí otázku, reaguj v kontextu

action_type = "explain_more"
- vysvětli jinak než předtím
- použij jiný příklad

action_type = "example"
- dej nový konkrétní příklad
- vysvětli ho krok po kroku

action_type = "practice"

Vždy vytvoř test. Počet otázek:
- pokud age ≤ 8 → 3 otázky
- pokud age ≥ 9 → 5 otázek

POVINNÝ FORMÁT – dodržuj PŘESNĚ, každý znak:

1. Text první otázky
A) možnost jedna
B) možnost dvě
C) možnost tři
D) možnost čtyři

2. Text druhé otázky
A) možnost jedna
B) možnost dvě
C) možnost tři
D) možnost čtyři

Pravidla formátu:
- číslo otázky + tečka + mezera + text (např. "1. Jaký je...")
- každá možnost na samostatném řádku
- písmeno + závorka + mezera + text (např. "A) text možnosti")
- mezi otázkami jeden prázdný řádek
- NIKDY nedávej A) na stejný řádek jako text otázky
- NIKDY neuváděj správné odpovědi

Na konci napiš: "Vyber u každé otázky jednu možnost."

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
    const base = message ? message : (context ? `Kontext předchozí odpovědi:\n${context}` : "Pokračuj.");
    return `[action_type: ${actionType}]\n\n${base}`;
  }
  return message;
}

// ─────────────────────────────────────────────
// HELPER: převede history z frontendu na OpenAI messages formát
// history = [{ role: "user"|"assistant", content: "..." }, ...]
// Ořežeme na posledních 6 zpráv (3 páry) aby se nezatěžoval kontext
// ─────────────────────────────────────────────
function buildHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history
    .filter(m => m.role && m.content && m.content.trim())
    .slice(-6)
    .map(m => ({ role: m.role, content: m.content.trim() }));
}

// ─────────────────────────────────────────────
// HELPER: vypočítá confidence rozumně
// Místo halucinace od modelu počítáme deterministicky:
// - faktické předměty (mat, fyzika, chemie...) → vysoká confidence
// - obecné dotazy → střední
// - vágní nebo mimo předmět → nižší
// ─────────────────────────────────────────────
function computeConfidence(message, subject, metaConfidence) {
  if (!message) return 0.85;

  const factualSubjects = ["matematika", "fyzika", "chemie", "přírodopis", "zeměpis", "dějepis", "informatika"];
  const isFactual = factualSubjects.some(s => subject.toLowerCase().includes(s));

  const msgLen = message.trim().length;
  const isSpecific = msgLen > 15; // konkrétní otázka, ne jednoslovná

  // Model vrátil confidence – použijeme ji ale omezíme rozsah
  // aby se nezobrazovalo 100% pro věci kde si nemůžeme být jisti
  let base = metaConfidence ?? 0.85;

  // Faktický předmět + konkrétní otázka = max 0.97
  if (isFactual && isSpecific) base = Math.min(base, 0.97);
  // Jazykové předměty = trochu méně jisté (subjektivnější)
  else if (subject.toLowerCase().includes("jazyk") || subject.toLowerCase().includes("angličtina")) base = Math.min(base, 0.92);
  // Vágní dotaz
  else if (!isSpecific) base = Math.min(base, 0.80);

  // Nikdy nezobrazujeme 100% – vždy je prostor pro nuanci
  return Math.min(base, 0.97);
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
    history = [],        // ← NOVÉ: conversation history
  } = req.body;

  // Pro action_type volání (explain_more, example, practice) je prázdná message OK
  if (!message && (!action_type || action_type === "normal")) {
    return res.status(400).json({ error: "Chybí message." });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    // Sestavíme messages: system + history + aktuální user message
    const historyMessages = buildHistory(history);
    const currentUserMessage = buildUserMessage(message, action_type, context);

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
        ...historyMessages,          // ← vložíme historii před aktuální zprávu
        {
          role: "user",
          content: currentUserMessage,
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
// POST /ai-meta  →  vrací JSON metadata (akce, confidence, image_url)
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
  "confidence": 0.9,
  "image_query": "krátký anglický výraz pro ilustrační obrázek (2-3 slova) nebo null"
}

Pravidla:
- actions vždy obsahuje právě tato 3 tlačítka: explain_more, example, practice
- confidence: odhadni jak fakticky přesná bude odpověď (0.7–0.97), NIKDY nedávej 1.0
- image_query: VŽDY vyplň relevantní anglický výraz vhodný pro vzdělávací obrázek pro děti
  Příklady: "fraction pizza math", "water cycle diagram", "roman soldiers", "human heart anatomy"
  Pouze null pokud je dotaz zcela abstraktní nebo konverzační
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
      meta = { actions: ["explain_more", "example", "practice"], confidence: 0.85, image_query: null };
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
      return a;
    });

    // Deterministická confidence – nezávisí jen na modelu
    const confidence = computeConfidence(message, subject, meta.confidence);

    // image_url: sestavíme z image_query přes Unsplash Source (free, bez API key)
    let image_url = null;
    if (meta.image_query) {
      const query = encodeURIComponent(meta.image_query);
      // Unsplash Source vrací náhodný relevantní obrázek – funguje bez API key
      image_url = `https://source.unsplash.com/400x250/?${query}`;
    }

    res.json({
      actions,
      confidence,
      image_query: meta.image_query ?? null,
      image_url,   // ← NOVÉ: připravená URL pro frontend
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

  const voiceMap = {
    neutral: "nova",
    happy: "shimmer",
    thinking: "nova",
    excited: "shimmer",
  };
  const voice = voiceMap[emotion] || "nova";

  let speed = 1.0;
  if (age <= 8) speed = 0.85;
  else if (age <= 11) speed = 0.95;
  else speed = 1.0;

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