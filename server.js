import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json());

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =====================================================
// HEALTH CHECK
// =====================================================
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// =====================================================
// STREAM ENDPOINT (TEXT ONLY)
// =====================================================
app.post("/ai-stream", async (req, res) => {
  try {
    const { message, subject, age, action_type, context } = req.body;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      stream: true,
      messages: [
        {
          role: "system",
          content: `
Jsi ŠikulAI – vzdělávací asistent pro děti 6–15 let.

Nikdy nevypisuj JSON.
Nikdy nevypisuj metadata.
Nikdy nevypisuj technické značky.
Vracíš pouze čistý text.

--------------------------------------------------

action_type = "normal"
- Vysvětli téma přiměřeně věku.
- Buď stručný a jasný.

--------------------------------------------------

action_type = "explain_more"
- Vysvětli jiným způsobem.
- Použij jiný příklad.

--------------------------------------------------

action_type = "example"
- Ukaž nový konkrétní příklad.
- Vysvětli ho krok po kroku.

--------------------------------------------------

action_type = "practice"

Vždy generuj multiple-choice test.

- Pokud age ≤ 8 → vytvoř 3 otázky.
- Pokud age ≥ 9 → vytvoř 5 otázek.

Každá otázka musí mít přesně 4 možnosti.
Označ možnosti přesně:

A)
B)
C)
D)

Formát musí být přesně:

1. Otázka text?
A) možnost
B) možnost
C) možnost
D) možnost

Nevypisuj správnou odpověď.
Nevypisuj řešení.
Na konci napiš:
"Vyber u každé otázky jednu možnost."

--------------------------------------------------

action_type = "evaluate_practice"

- Vyhodnoť odpovědi ve formátu např. A,B,C,D
- U každé otázky napiš:

1. ✔ správně
nebo
1. ✖ špatně – správná odpověď je B, protože ...

- Pokud je více než polovina správně → pochval.
- Pokud je méně než polovina správně →
  napiš:
  "Chceš si to znovu vysvětlit jiným způsobem?"

Buď podporující.
`
        },
        {
          role: "user",
          content: `
subject: ${subject}
age: ${age}
action_type: ${action_type || "normal"}
context:
${context || "none"}

Otázka:
${message || ""}
`
        }
      ]
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        res.write(content);
      }
    }

    res.end();

  } catch (error) {
    console.error("Streaming error:", error);
    res.status(500).end();
  }
});

// =====================================================
// METADATA ENDPOINT
// =====================================================
app.post("/ai-meta", async (req, res) => {
  try {
    const { message, subject, age, action_type, context } = req.body;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
Vrať pouze JSON metadata:

{
  "short_answer": "",
  "confidence": 0.0,
  "image_query": "",
  "actions": []
}

Pravidla:

Nenabízej:
- check_understanding
- "Je ti to jasné?"

Možné akce:

{
  "type": "explain_more",
  "label": "Vysvětlit jinak"
}

{
  "type": "example",
  "label": "Ukázat další příklad"
}

{
  "type": "practice",
  "label": "Procvičit"
}

Maximálně 3 akce.
Nevypisuj nic jiného.
`
        },
        {
          role: "user",
          content: `
subject: ${subject}
age: ${age}
action_type: ${action_type || "normal"}
context:
${context || "none"}

Otázka:
${message || ""}
`
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    const parsed = JSON.parse(content);

    res.json(parsed);

  } catch (error) {
    console.error("Metadata error:", error);
    res.status(500).json({ error: "Metadata generation failed" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Railway AI Gateway running on port ${PORT}`);
});