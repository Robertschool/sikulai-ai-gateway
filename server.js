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
Vrať pouze validní JSON.
Přizpůsob odpověď věku ${age}.
Předmět: ${subject}.
Maximálně 3 zdroje.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    const content = response.choices[0].message.content;

    return res.json(JSON.parse(content));

  } catch (error) {
    console.error("Runtime error:", error);
    return res.status(500).json({ error: "Gateway runtime error" });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Gateway running on port ${PORT}`);
});