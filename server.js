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
// HEALTH CHECK
// ===============================
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// ===============================
// STREAMING AI ENDPOINT
// ===============================
app.post("/ai", async (req, res) => {
  try {
    const { message, subject, age } = req.body;

    if (!message || !subject || !age) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Nastavení streamovacích hlaviček
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      stream: true,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
Jsi ŠikulAI – vzdělávací asistent pro děti 6–15 let.
Vysvětluj stručně, jasně a přiměřeně věku.
Pokud je téma vizuální (proces, zvíře, místo, fyzikální jev),
přidej pole "image_query" s krátkým anglickým dotazem.
Jinak nech image_query prázdné.
Vrať pouze JSON.
`
        },
        {
          role: "user",
          content: `subject: ${subject}\nage: ${age}\n\nOtázka: ${message}`
        }
      ]
    });

    // Streamování dat po částech
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

// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Railway AI Gateway running on port ${PORT}`);
});