import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// ----------------------------------------------------------------------------
// Centralized AI Configuration & Resilient Provider Strategy
// ----------------------------------------------------------------------------
export const AI_CONFIG = {
  PRIMARY_MODEL: "gemini-3.8-flash",
  FALLBACK_MODEL: "gemini-3.1-flash-lite",
  REQUEST_TIMEOUT_MS: 15000, // 15s per model request to ensure responsive UI
};

// Helper to construct GoogleGenAI client lazily on demand
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured. Please set GEMINI_API_KEY in the Secrets panel.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Helper to execute generateContent with timeout
async function generateContentWithTimeout(
  model: string, 
  contents: any[], 
  systemInstruction: string,
  requestId: string
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err: any = new Error("GEMINI_API_KEY environment variable is not configured.");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }

  const startTime = Date.now();
  console.log(`[BioAI Provider][${requestId}] Calling Google GenAI SDK model=${model}`);

  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const elapsedTime = Date.now() - startTime;
      console.warn(`[BioAI Provider][${requestId}] Request to model ${model} timed out after ${elapsedTime}ms`);
      const err: any = new Error(`Request to model ${model} timed out after ${AI_CONFIG.REQUEST_TIMEOUT_MS}ms`);
      err.status = 500;
      err.code = "PROVIDER_TIMEOUT";
      reject(err);
    }, AI_CONFIG.REQUEST_TIMEOUT_MS);
  });

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });

  const generatePromise = ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      temperature: 0.2,
    },
  });

  try {
    const result = await Promise.race([generatePromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    const elapsedTime = Date.now() - startTime;
    console.log(`[BioAI Provider][${requestId}] Model ${model} responded successfully in ${elapsedTime}ms`);
    return result as any;
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    const elapsedTime = Date.now() - startTime;
    console.error(`[BioAI Provider][${requestId}] Error from model ${model} after ${elapsedTime}ms:`, {
      status: err?.status || err?.statusCode || err?.code || 500,
      message: err?.message || String(err),
    });
    throw err;
  }
}

// Helper to check if error is transient / fallback eligible (503, 502, 504, 429, unavailable, timeout, network error)
function isTransientOrTimeoutError(err: any): boolean {
  const status = err?.status || err?.statusCode || err?.code;
  const msg = (err?.message || "").toLowerCase();

  if (
    status === 503 || 
    status === 502 || 
    status === 504 || 
    status === 429 || 
    status === "PROVIDER_TIMEOUT" ||
    status === "TIMEOUT" || 
    status === "RESOURCE_EXHAUSTED" ||
    status === "UNAVAILABLE"
  ) {
    return true;
  }

  if (
    msg.includes("504") || 
    msg.includes("503") || 
    msg.includes("502") || 
    msg.includes("429") || 
    msg.includes("unavailable") || 
    msg.includes("high demand") || 
    msg.includes("quota") || 
    msg.includes("resource_exhausted") || 
    msg.includes("timed out") || 
    msg.includes("econnreset") || 
    msg.includes("etimedout")
  ) {
    return true;
  }

  return false;
}

// Helper to check if error is non-retryable authentication / permission error (401 / 403)
function isAuthError(err: any): boolean {
  const status = err?.status || err?.statusCode || err?.code;
  const msg = (err?.message || "").toLowerCase();
  return (
    status === 401 || 
    status === 403 || 
    msg.includes("api_key") || 
    msg.includes("unauthenticated") || 
    msg.includes("permission_denied") || 
    msg.includes("forbidden")
  );
}

// Helper to check if error is invalid argument / bad request (400)
function isBadRequestError(err: any): boolean {
  const status = err?.status || err?.statusCode || err?.code;
  const msg = (err?.message || "").toLowerCase();
  return status === 400 || (msg.includes("400") && !msg.includes("504")) || msg.includes("invalid_argument");
}

// Robust generation executor with fast controlled model fallback
async function executeAiRequestWithRetryAndFallback(
  contents: any[], 
  systemInstruction: string,
  requestId: string
) {
  const modelsToTry = Array.from(new Set([AI_CONFIG.PRIMARY_MODEL, AI_CONFIG.FALLBACK_MODEL]));
  let lastError: any = null;
  let lastAttemptedModel = AI_CONFIG.PRIMARY_MODEL;

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const model = modelsToTry[mIdx];
    lastAttemptedModel = model;

    if (mIdx > 0) {
      console.warn(`[BioAI Provider][${requestId}] Activating fallback model: ${model}`);
    }

    try {
      const response = await generateContentWithTimeout(model, contents, systemInstruction, requestId);
      return { 
        response, 
        modelUsed: model, 
        fallbackUsed: model !== AI_CONFIG.PRIMARY_MODEL 
      };
    } catch (err: any) {
      lastError = err;

      // Do NOT retry permanent auth errors
      if (isAuthError(err)) {
        throw err;
      }

      // Do NOT retry bad requests
      if (isBadRequestError(err)) {
        throw err;
      }

      // If more models available, transition immediately to fallback
      if (mIdx < modelsToTry.length - 1) {
        console.warn(`[BioAI Provider][${requestId}] Model ${model} failed, immediately trying next model...`);
        continue;
      }
    }
  }

  if (lastError) {
    lastError.lastAttemptedModel = lastAttemptedModel;
  }
  throw lastError;
}

// ----------------------------------------------------------------------------
// POST /api/ai/chat - Grounded Scientific AI Assistant API Route
// ----------------------------------------------------------------------------
app.post("/api/ai/chat", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const routeStartTime = Date.now();

  try {
    const { message, history, context } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ 
        ok: false, 
        error: "A non-empty prompt message is required.",
        code: "INVALID_PROMPT",
        modelUsed: AI_CONFIG.PRIMARY_MODEL 
      });
    }

    try {
      getGeminiClient();
    } catch (keyErr: any) {
      return res.status(401).json({ 
        ok: false,
        error: "BioAI configuration error. Please check your GEMINI_API_KEY in server secrets.",
        code: "UNAUTHORIZED",
        modelUsed: AI_CONFIG.PRIMARY_MODEL
      });
    }

    // Format context into a clean JSON string for system prompt
    let contextStr = "No active database context selected.";
    if (context && typeof context === "object") {
      contextStr = JSON.stringify(context, null, 2);
    }

    const systemInstruction = `You are BioAI, the specialized scientific AI Assistant for BioCode Studio (a professional bioinformatics studio).

CURRENT BIOCODE STUDIO DATABASE CONTEXT:
\`\`\`json
${contextStr}
\`\`\`

STRICT GROUNDING & SCIENTIFIC ANSWERING MANDATES:
1. Grounding in Database Context:
   - When answering questions about the current sequence, analysis, version, or project, rely strictly on the data provided in the CURRENT BIOCODE STUDIO DATABASE CONTEXT above.
   - If the user asks for specific data, sequence accessions, length, pI, molecular weight, or results that are NOT provided in the current context, explicitly state:
     "The required information is not available in the current BioCode Studio context."
   - NEVER fabricate accessions, sequences, atomic masses, isoelectric points, mutation sites, or analysis numbers.

2. Source Distinction Categories:
   When presenting information, clearly identify or distinguish sources using these terms/tags when appropriate:
   - [DATABASE FACT] Verified records from BioCode Studio tables (Accession, Organism, Length, Definition).
   - [CALCULATED RESULT] Analytical outputs computed by BioCode Studio pipelines (e.g. pI = 6.45, MW = 29.8 kDa, GRAVY = -0.32).
   - [AI INTERPRETATION] Analytical & biological explanations of what those results indicate.
   - [GENERAL BIOLOGICAL KNOWLEDGE] Established scientific principles, literature knowledge, or biochemistry concepts.

3. Answer Structure:
   For scientific questions, structure your answer using clean formatting:
   ### Answer
   (Direct, clear response)

   ### Evidence from Current Context
   (Specific metrics/facts from the BioCode Studio context)

   ### Scientific Interpretation
   (Biological significance, structural implications, or function)

   ### Limitations / Context Availability
   (Any missing context or boundary notes)

Keep explanations scientific, clear, concise, and professional. Avoid marketing fluff or informal tone.`;

    // Construct history array for Gemini API call
    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const msg of history) {
        if (msg.role && msg.content) {
          contents.push({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.content }],
          });
        }
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    console.log(`[BioAI][${requestId}] Start processing request. Prompt length: ${message.length} chars. History length: ${contents.length - 1} msgs.`);

    const { response, modelUsed, fallbackUsed } = await executeAiRequestWithRetryAndFallback(contents, systemInstruction, requestId);

    const replyText = response.text || "No response text generated by BioAI.";
    const totalDuration = Date.now() - routeStartTime;

    console.log(`[BioAI][${requestId}] Request completed successfully in ${totalDuration}ms. Model used: ${modelUsed}. Fallback used: ${fallbackUsed}`);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({ 
      ok: true, 
      text: replyText, 
      modelUsed 
    });

  } catch (err: any) {
    const totalDuration = Date.now() - routeStartTime;
    const modelUsed = err?.lastAttemptedModel || AI_CONFIG.PRIMARY_MODEL;
    console.error(`[BioAI][${requestId}] Route execution failed after ${totalDuration}ms:`, {
      status: err?.status || err?.statusCode || err?.code || 500,
      message: err?.message || String(err),
      modelUsed
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (isAuthError(err)) {
      return res.status(401).json({
        ok: false,
        error: "BioAI configuration error. Please check your GEMINI_API_KEY in server secrets.",
        code: "UNAUTHORIZED",
        modelUsed
      });
    }

    if (isBadRequestError(err)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid request parameters sent to BioAI.",
        code: "BAD_REQUEST",
        modelUsed
      });
    }

    if (err?.status === 429 || (err?.message || "").includes("quota") || (err?.message || "").includes("429")) {
      return res.status(429).json({
        ok: false,
        error: "BioAI is experiencing high request volume. Please try again in a moment.",
        code: "RATE_LIMIT",
        modelUsed
      });
    }

    if (err?.status === 504 || err?.code === "PROVIDER_TIMEOUT" || (err?.message || "").includes("timed out")) {
      return res.status(500).json({
        ok: false,
        error: "BioAI provider timed out while generating a response. Please try again.",
        code: "PROVIDER_TIMEOUT",
        modelUsed
      });
    }

    if (isTransientOrTimeoutError(err)) {
      return res.status(500).json({
        ok: false,
        error: "BioAI is temporarily unavailable. The AI provider is experiencing high demand. Please try again shortly.",
        code: "SERVICE_UNAVAILABLE",
        modelUsed
      });
    }

    return res.status(500).json({ 
      ok: false,
      error: "BioAI generation error. The AI provider could not complete your request. Please try again.",
      code: "AI_PROVIDER_ERROR",
      modelUsed
    });
  }
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "BioCode Studio Server", geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

// Fallback JSON handler for unknown /api/* routes (prevents falling through to HTML SPA fallback)
app.use("/api/*", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(404).json({ error: "API route not found." });
});

// Central Express API Error Handler (guarantees JSON error response)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[BioAI Express API Error]", err);
  res.setHeader("Content-Type", "application/json");
  res.status(err?.status || 500).json({
    error: err?.message || "BioAI is temporarily unavailable. Please try again shortly."
  });
});

// Start Express server with Vite middleware integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : undefined,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BioCode Studio Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
