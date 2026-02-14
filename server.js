import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json());

let openai;

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set");
} else {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

app.post("/ai", async (req, res) => {

  if (!openai) {
    return res.status(500).json({ error: "AI not configured" });
  }

  try {
    const { message, subject, age } = req.body;

    if (!message || !subject || !age) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const systemPrompt = `
Jsi ŠikulAI – bezpečný dětský vzdělávací asistent.
Vrať POUZE validní JSON bez vysvětlujícího textu.
Odpověď přizpůsob věku ${age}.
Předmět: ${subject}.
Struktura:
{
  "otázka": "...",
  "odpověď": {
    "vysvětlení": "...",
    "příklady": [],
    "užitečné_info": "..."
  },
  "zdroje": []
}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 250,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: "Empty OpenAI response" });
    }

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error:", content);
      return res.status(500).json({ error: "Invalid JSON from model" });
    }

    return res.json(parsed);

  } catch (error) {
    console.error("Runtime error:", error);
    return res.status(500).json({ error: "Gateway runtime error" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Gateway running on port ${PORT}`);
});