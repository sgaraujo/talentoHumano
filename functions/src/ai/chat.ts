import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import OpenAI from "openai";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const allowedOrigins = [
  "http://localhost:5173",
  "https://nelyoda.web.app",
  "https://nelyoda.firebaseapp.com",
];

export const aiChat = onRequest(
  {
    region: "us-central1",
    secrets: [OPENAI_API_KEY],
  },
  async (req, res) => {
    // --- CORS ---
    const origin = req.headers.origin || "";
    if (allowedOrigins.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
    }
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { messages } = req.body as { messages: ChatMessage[] };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages es requerido" });
        return;
      }

      const apiKey = OPENAI_API_KEY.value();
      if (!apiKey) {
        console.error("OPENAI_API_KEY missing");
        res.status(500).json({ error: "OPENAI_API_KEY missing" });
        return;
      }

      const client = new OpenAI({ apiKey });

      const response = await client.responses.create({
        model: "gpt-5.2-chat-latest",
        max_output_tokens: 700,
        input: messages.map((m) => ({
          role: m.role,
          content: [{ type: "input_text", text: m.content }],
        })),
      });

      res.json({ text: response.output_text });
    } catch (err: unknown) {
      console.error("CHAT_ERROR", err);
      res.status(500).json({
        error:
          err && typeof err === "object" && "message" in err
            ? (err as any).message
            : "Error en OpenAI",
      });
    }
  }
);
