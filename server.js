import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is not set");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===============================
// HEALTH CHECK (pro Railway ping)
// ===============================
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// ===============================
// AI ENDPOINT
// ===============================
app.post("/ai", async (req, res) => {
  try {
    const { message, subject, age } = req.body;

    if (!message || !subject || !age) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const startTime = Date.now();

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      max_output_tokens: 300,
      response_format: { type: "json_object" },
      input: [
        {
          role: "system",
          content: `
Jsi ŠikulAI, vzdělávací asistent pro děti 6–15 let.
Vysvětluj učivo stručně, jasně a přiměřeně věku.
Buď přirozený a přidej maximálně jednu krátkou podporující větu.
Nevkládej zdroje ani obrázky.
Vrať pouze validní JSON.
`
        },
        {
          role: "user",
          content: `
Otázka: ${message}
Předmět: ${subject}
Věk: ${age}

Struktura odpovědi:
{
  "short_answer":"",
  "main_answer":"",
  "extra_for_older":"",
  "confidence":0.0
}
`
        }
      ]
    });

    const rawOutput = response.output_text;

    if (!rawOutput) {
      return res.status(500).json({ error: "Empty OpenAI response" });
    }

    let parsed;

    try {
      parsed = JSON.parse(rawOutput);
    } catch (err) {
      console.error("Invalid JSON from model:", rawOutput);
      return res.status(500).json({ error: "Invalid JSON from model" });
    }

    const duration = Date.now() - startTime;
    console.log(`⚡ Response time: ${duration} ms`);

    return res.json(parsed);

  } catch (error) {
    console.error("Runtime error:", error);
    return res.status(500).json({ error: "Gateway runtime error" });
  }
});

// ===============================
// SERVER START
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ŠikulAI Gateway running on port ${PORT}`);
});