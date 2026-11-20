import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import {
  resolveStructureForSequence,
  calculateSequenceHash,
  startStructurePredictionJob,
  getStructurePredictionJob
} from "./src/server/structureService";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// ----------------------------------------------------------------------------
// Centralized AI Configuration & Resilient Provider Strategy (Single Source of Truth)
// ----------------------------------------------------------------------------
export const AI_CONFIG = {
  PRIMARY_MODEL: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  FALLBACK_MODELS: ["gemini-flash-lite-latest", "gemini-3.5-flash-lite"],
  REQUEST_TIMEOUT_MS: 20000, // 20s per provider attempt
  MAX_RETRIES_PER_MODEL: 1,  // at most 1 retry for primary model on transient/rate-limit
};

export type AiErrorCategory = 
  | 'AUTH_ERROR'
  | 'BAD_REQUEST'
  | 'INVALID_MODEL'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'TEMPORARY_SERVER_FAILURE'
  | 'UNKNOWN';

export interface ClassifiedAiError {
  category: AiErrorCategory;
  canRetrySameModel: boolean;
  canTryFallback: boolean;
  httpStatus: number;
  message: string;
}

export function classifyAiError(err: any): ClassifiedAiError {
  const status = Number(err?.status || err?.statusCode || (typeof err?.code === 'number' ? err.code : 0)) || 0;
  const code = String(err?.code || '').toUpperCase();
  const rawMsg = String(err?.message || err || '').toLowerCase();

  // 1. Authentication / Permission errors (401 / 403)
  if (status === 401 || status === 403 || rawMsg.includes('api_key') || rawMsg.includes('unauthenticated') || rawMsg.includes('permission_denied') || rawMsg.includes('forbidden')) {
    return {
      category: 'AUTH_ERROR',
      canRetrySameModel: false,
      canTryFallback: false,
      httpStatus: 401,
      message: 'Gemini API authentication failed. Please verify your GEMINI_API_KEY in server secrets.'
    };
  }

  // 2. Bad request / invalid arguments (400)
  if (status === 400 && !rawMsg.includes('504') && !rawMsg.includes('timeout')) {
    return {
      category: 'BAD_REQUEST',
      canRetrySameModel: false,
      canTryFallback: false,
      httpStatus: 400,
      message: 'Invalid prompt or context arguments sent to BioAI.'
    };
  }

  // 3. Invalid or discontinued model (404) - DO NOT retry same model, switch to fallback immediately
  if (status === 404 || rawMsg.includes('not found') || rawMsg.includes('no longer available') || rawMsg.includes('unsupported model') || rawMsg.includes('not_found')) {
    return {
      category: 'INVALID_MODEL',
      canRetrySameModel: false,
      canTryFallback: true,
      httpStatus: 404,
      message: 'Configured AI model is discontinued or unavailable from provider.'
    };
  }

  // 4. Rate limit / quota exhausted (429)
  if (status === 429 || code === 'RESOURCE_EXHAUSTED' || rawMsg.includes('429') || rawMsg.includes('quota') || rawMsg.includes('resource_exhausted')) {
    return {
      category: 'RATE_LIMIT',
      canRetrySameModel: true,
      canTryFallback: true,
      httpStatus: 429,
      message: 'AI provider rate limit reached. Retrying request with backoff.'
    };
  }

  // 5. Timeout (504, PROVIDER_TIMEOUT, ETIMEDOUT) - do not wait another full timeout on same model, switch to fallback
  if (status === 504 || code === 'PROVIDER_TIMEOUT' || code === 'ETIMEDOUT' || rawMsg.includes('timed out') || rawMsg.includes('timeout')) {
    return {
      category: 'TIMEOUT',
      canRetrySameModel: false,
      canTryFallback: true,
      httpStatus: 504,
      message: 'AI provider request timed out. Transitioning to fallback model.'
    };
  }

  // 6. Temporary server failure (500, 502, 503, UNAVAILABLE, high demand)
  if (status === 502 || status === 503 || status === 500 || code === 'UNAVAILABLE' || rawMsg.includes('503') || rawMsg.includes('high demand') || rawMsg.includes('unavailable') || rawMsg.includes('econnreset')) {
    return {
      category: 'TEMPORARY_SERVER_FAILURE',
      canRetrySameModel: false, // Switch immediately to next model in pipeline on high-demand spikes
      canTryFallback: true,
      httpStatus: 503,
      message: 'AI provider model is experiencing high demand. Automatic failover active.'
    };
  }

  return {
    category: 'UNKNOWN',
    canRetrySameModel: false,
    canTryFallback: true,
    httpStatus: 500,
    message: 'BioAI generation encountered an unexpected error.'
  };
}

// Controlled exponential backoff with jitter
function getBackoffDelayMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

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
  console.log(`[BioAI Provider] model=${model} status=calling requestId=${requestId}`);

  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const elapsedTime = Date.now() - startTime;
      console.warn(`[BioAI Provider] model=${model} status=timeout elapsed=${elapsedTime}ms requestId=${requestId}`);
      const err: any = new Error(`Request to model ${model} timed out after ${AI_CONFIG.REQUEST_TIMEOUT_MS}ms`);
      err.status = 504;
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
    console.log(`[BioAI Provider] model=${model} status=success elapsed=${elapsedTime}ms requestId=${requestId}`);
    return result as any;
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    const elapsedTime = Date.now() - startTime;
    console.error(`[BioAI Provider] model=${model} status=error elapsed=${elapsedTime}ms requestId=${requestId}:`, {
      message: err?.message || String(err),
      status: err?.status || err?.statusCode || 500
    });
    throw err;
  }
}

// Robust generation executor with fast controlled model fallback
async function executeAiRequestWithRetryAndFallback(
  contents: any[], 
  systemInstruction: string,
  requestId: string
): Promise<{ text: string; modelUsed: string; fallbackUsed: boolean }> {
  const modelsToTry = Array.from(new Set([AI_CONFIG.PRIMARY_MODEL, ...AI_CONFIG.FALLBACK_MODELS]));
  let lastErrorDetail: any = null;
  let lastAttemptedModel = AI_CONFIG.PRIMARY_MODEL;
  const executionStartTime = Date.now();

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const model = modelsToTry[mIdx];
    lastAttemptedModel = model;
    const isFallback = mIdx > 0;

    if (isFallback) {
      console.warn(`[BioAI Fallback] from=${modelsToTry[mIdx - 1]} to=${model} requestId=${requestId}`);
    }

    // PRIMARY: 1 request + at most 1 retry. FALLBACK: 1 request (no repeated retries)
    const maxAttempts = isFallback ? 1 : (1 + AI_CONFIG.MAX_RETRIES_PER_MODEL);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[BioAI Request] requestId=${requestId} model=${model} attempt=${attempt}/${maxAttempts}`);

      try {
        const response = await generateContentWithTimeout(model, contents, systemInstruction, requestId);
        const replyText = response?.text || "";

        if (!replyText.trim()) {
          throw new Error("Received empty text from AI provider.");
        }

        const duration = Date.now() - executionStartTime;
        console.log(`[BioAI Success] requestId=${requestId} model=${model} duration=${duration}ms fallbackUsed=${isFallback}`);

        return { 
          text: replyText, 
          modelUsed: model, 
          fallbackUsed: isFallback 
        };
      } catch (err: any) {
        const classification = classifyAiError(err);
        lastErrorDetail = { ...classification, modelAttempted: model, originalError: err };

        console.warn(`[BioAI Provider] model=${model} status=${classification.httpStatus} category=${classification.category} requestId=${requestId}`);

        // If non-recoverable error (e.g. 401 Auth or 400 Bad Request): fail immediately
        if (!classification.canTryFallback && !classification.canRetrySameModel) {
          console.error(`[BioAI Failure] code=${classification.category} message=${classification.message} requestId=${requestId}`);
          const fatalErr: any = new Error(classification.message);
          fatalErr.code = classification.category;
          fatalErr.status = classification.httpStatus;
          fatalErr.lastAttemptedModel = model;
          throw fatalErr;
        }

        // If invalid model (404), DO NOT retry the same model! Immediately break to next fallback model
        if (!classification.canRetrySameModel) {
          console.warn(`[BioAI Provider] Model ${model} is invalid/unsupported. Immediately moving to next fallback model.`);
          break;
        }

        // If we can retry the same model and have attempts remaining:
        if (attempt < maxAttempts) {
          const delay = getBackoffDelayMs(attempt);
          console.log(`[BioAI Retry] reason=${classification.category} delay=${delay}ms model=${model} requestId=${requestId}`);
          await new Promise(res => setTimeout(res, delay));
        } else {
          console.warn(`[BioAI Provider] Model ${model} exhausted max attempts (${maxAttempts}).`);
        }
      }
    }
  }

  // All candidate models and retries exhausted
  console.error(`[BioAI Failure] All candidate models exhausted for requestId=${requestId}. Last model=${lastAttemptedModel} category=${lastErrorDetail?.category}`);
  const finalError: any = new Error(lastErrorDetail?.message || "BioAI service is temporarily unavailable.");
  finalError.code = lastErrorDetail?.category || "SERVICE_UNAVAILABLE";
  finalError.status = lastErrorDetail?.httpStatus || 500;
  finalError.lastAttemptedModel = lastAttemptedModel;
  throw finalError;
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

    const { text, modelUsed, fallbackUsed } = await executeAiRequestWithRetryAndFallback(contents, systemInstruction, requestId);
    const totalDuration = Date.now() - routeStartTime;

    console.log(`[BioAI][${requestId}] Request completed successfully in ${totalDuration}ms. Model used: ${modelUsed}. Fallback used: ${fallbackUsed}`);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({ 
      ok: true, 
      text, 
      modelUsed,
      requestId
    });

  } catch (err: any) {
    const totalDuration = Date.now() - routeStartTime;
    const modelUsed = err?.lastAttemptedModel || err?.modelAttempted || AI_CONFIG.PRIMARY_MODEL;
    const classification = classifyAiError(err);
    const errCode = err?.code || classification.category;
    const errMessage = err?.message || classification.message;
    const httpStatus = err?.status || classification.httpStatus || 500;

    console.error(`[BioAI Failure] requestId=${requestId} duration=${totalDuration}ms modelUsed=${modelUsed} code=${errCode}:`, errMessage);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(httpStatus).json({
      ok: false,
      error: {
        code: errCode,
        message: errMessage
      },
      modelUsed,
      requestId
    });
  }
});

// ----------------------------------------------------------------------------
// GET /api/ai/config - Single Source of Truth for BioAI Configuration
// ----------------------------------------------------------------------------
app.get("/api/ai/config", (_req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).json({
    ok: true,
    primaryModel: AI_CONFIG.PRIMARY_MODEL,
    fallbackModels: AI_CONFIG.FALLBACK_MODELS,
    configured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// ----------------------------------------------------------------------------
// POST /api/structure/resolve - Sequence-Derived 3D Structure Resolution Service
// ----------------------------------------------------------------------------
app.post("/api/structure/resolve", async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  try {
    const {
      sequence,
      sequenceId,
      sequenceVersion,
      sequenceHash,
      accession,
      sequenceType,
      preferredPdbId,
      allowSequenceDerivedFallback,
      mutations,
      originalSequence,
      templatePdbId,
      templatePdbText,
      autoPredict
    } = req.body;

    if (!sequence || typeof sequence !== "string" || !sequence.trim()) {
      return res.status(400).json({
        ok: false,
        error: "A valid non-empty biological sequence is required to resolve 3D structure.",
        code: "INVALID_SEQUENCE"
      });
    }

    const structure = await resolveStructureForSequence({
      sequence,
      sequenceId,
      sequenceVersion,
      sequenceHash,
      accession,
      sequenceType,
      preferredPdbId,
      allowSequenceDerivedFallback: allowSequenceDerivedFallback === true,
      mutations,
      originalSequence,
      templatePdbId,
      templatePdbText,
      autoPredict: autoPredict === true
    });

    return res.json({
      ok: true,
      structure
    });
  } catch (err: any) {
    console.error("[Structure Service Route Error]", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to resolve 3D macromolecular structure from sequence.",
      code: "STRUCTURE_RESOLUTION_ERROR"
    });
  }
});

// ----------------------------------------------------------------------------
// POST /api/structure/predict - Start Asynchronous Molecular Structure Prediction Job
// ----------------------------------------------------------------------------
app.post("/api/structure/predict", (req, res) => {
  res.setHeader("Content-Type", "application/json");

  try {
    const { sequence } = req.body;
    if (!sequence || typeof sequence !== "string" || !sequence.trim()) {
      return res.status(400).json({
        ok: false,
        error: "A valid non-empty sequence is required to start a structure prediction job.",
        code: "INVALID_SEQUENCE"
      });
    }

    const job = startStructurePredictionJob(req.body);
    return res.status(202).json({
      ok: true,
      job
    });
  } catch (err: any) {
    console.error("[Structure Prediction Job Start Error]", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to start structure prediction job.",
      code: "JOB_START_ERROR"
    });
  }
});

// ----------------------------------------------------------------------------
// GET /api/structure/jobs/:jobId - Poll Asynchronous Structure Job Status
// ----------------------------------------------------------------------------
app.get("/api/structure/jobs/:jobId", (req, res) => {
  res.setHeader("Content-Type", "application/json");

  const { jobId } = req.params;
  const job = getStructurePredictionJob(jobId);

  if (!job) {
    return res.status(404).json({
      ok: false,
      error: `Structure prediction job '${jobId}' was not found.`,
      code: "JOB_NOT_FOUND"
    });
  }

  return res.status(200).json({
    ok: true,
    job
  });
});

// ----------------------------------------------------------------------------
// GET /api/ncbi/fetch - Backend Proxy for NCBI E-utilities efetch.fcgi
// Resolves CORS issues, handles large sequence range requests, and sets robust timeouts
// ----------------------------------------------------------------------------
app.get("/api/ncbi/fetch", async (req, res) => {
  const { db, id, rettype = "fasta", retmode = "text", seq_start, seq_stop, strand } = req.query;

  if (!id || typeof id !== "string") {
    res.setHeader("Content-Type", "application/json");
    return res.status(400).json({ ok: false, error: "Accession ID parameter 'id' is required." });
  }

  const normalizedDb = (db === "nucleotide" || db === "nuccore" || !db) ? "nuccore" : (db === "protein" ? "protein" : String(db));

  try {
    const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
    url.searchParams.set("db", normalizedDb);
    url.searchParams.set("id", String(id).trim());
    url.searchParams.set("rettype", String(rettype));
    url.searchParams.set("retmode", String(retmode));

    if (seq_start && !isNaN(Number(seq_start))) {
      url.searchParams.set("seq_start", String(seq_start));
    }
    if (seq_stop && !isNaN(Number(seq_stop))) {
      url.searchParams.set("seq_stop", String(seq_stop));
    }
    if (strand) {
      url.searchParams.set("strand", String(strand));
    } else if (normalizedDb === "nuccore") {
      url.searchParams.set("strand", "1");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);

    const ncbiRes = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "BioCodeStudio/1.0 (bioinformatics-studio@biocode.dev)"
      }
    });
    clearTimeout(timeoutId);

    if (!ncbiRes.ok) {
      res.setHeader("Content-Type", "application/json");
      return res.status(ncbiRes.status).json({
        ok: false,
        error: `NCBI Entrez returned HTTP ${ncbiRes.status}: ${ncbiRes.statusText}`
      });
    }

    const text = await ncbiRes.text();
    if (!text || text.includes("Error occurred") || text.includes("<!DOCTYPE html>")) {
      res.setHeader("Content-Type", "application/json");
      return res.status(404).json({
        ok: false,
        error: `NCBI record ${id} was not accessible or returned an invalid payload.`
      });
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(text);
  } catch (err: any) {
    console.error(`[NCBI Proxy Error] Failed to fetch ${id} from db ${normalizedDb}:`, err);
    res.setHeader("Content-Type", "application/json");
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to retrieve sequence from NCBI E-utilities."
    });
  }
});

// ----------------------------------------------------------------------------
// GET /api/ncbi/summary - Backend Proxy for NCBI E-utilities esummary.fcgi
// ----------------------------------------------------------------------------
app.get("/api/ncbi/summary", async (req, res) => {
  const { db, id } = req.query;

  if (!id || typeof id !== "string") {
    res.setHeader("Content-Type", "application/json");
    return res.status(400).json({ ok: false, error: "Accession ID parameter 'id' is required." });
  }

  const normalizedDb = (db === "nucleotide" || db === "nuccore" || !db) ? "nuccore" : (db === "protein" ? "protein" : String(db));

  try {
    const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
    url.searchParams.set("db", normalizedDb);
    url.searchParams.set("id", String(id).trim());
    url.searchParams.set("retmode", "json");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    const ncbiRes = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "BioCodeStudio/1.0 (bioinformatics-studio@biocode.dev)"
      }
    });
    clearTimeout(timeoutId);

    if (!ncbiRes.ok) {
      res.setHeader("Content-Type", "application/json");
      return res.status(ncbiRes.status).json({
        ok: false,
        error: `NCBI Entrez returned HTTP ${ncbiRes.status}: ${ncbiRes.statusText}`
      });
    }

    const json = await ncbiRes.json();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json(json);
  } catch (err: any) {
    console.error(`[NCBI Summary Proxy Error] Failed for ${id}:`, err);
    res.setHeader("Content-Type", "application/json");
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to retrieve summary from NCBI E-utilities."
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
