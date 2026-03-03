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

// ===============================
// STREAM ENDPOINT (TEXT ONLY)
// ===============================
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
Vrať pouze hlavní text odpovědi.
Nevypisuj JSON.
Nevypisuj metadata.
Nevypisuj technické značky.
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
${message}
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

// ===============================
// METADATA ENDPOINT (JSON ONLY)
// ===============================
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
Vrať pouze JSON metadata ve formátu:

{
  "short_answer": "",
  "confidence": 0.0,
  "image_query": "",
  "actions": []
}

Pravidla:
- Vždy přidej akci:
  { "type": "check_understanding", "label": "Je ti to jasné?" }

- Podle vhodnosti můžeš přidat:
  explain_more
  test
  flashcards

Nevypisuj žádný jiný text.
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
${message}
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

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Railway AI Gateway running on port ${PORT}`);
});