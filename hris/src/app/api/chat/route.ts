import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, parseBody, err } from '@/lib/api';
import { CHATBOT_SYSTEM_PROMPT } from '@/lib/chatKb';

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(20),
});

const GEMINI_MODEL = 'gemini-3.6-flash';

/**
 * POST /api/chat
 *   Google Gemini-backed chat with a scoped system prompt.
 *   Requires GEMINI_API_KEY. Rate-limited via requireAuth's built-in cap.
 */
export async function POST(req: Request) {
  const [, error] = await requireAuth(req, {
    rateLimit: { max: 20, windowMs: 60_000 },
  });
  if (error) return error;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'NOT_CONFIGURED',
        message:
          "Chat isn't configured on this deployment yet. Ask your Super Admin to add GEMINI_API_KEY.",
      },
      { status: 501 }
    );
  }

  const [input, badReq] = await parseBody(req, Body);
  if (badReq) return badReq;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: CHATBOT_SYSTEM_PROMPT }],
        },
        contents: input.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.4,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[chat] gemini upstream error', res.status, errBody);
      return err(502, 'UPSTREAM', 'The assistant is temporarily unavailable.');
    }

    const data = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
      promptFeedback?: { blockReason?: string };
    };

    if (data.promptFeedback?.blockReason) {
      return NextResponse.json({
        reply:
          "I couldn't respond to that — the request was filtered by safety rules. Try rephrasing?",
      });
    }

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim() ?? '';

    return NextResponse.json({ reply: text || '…' });
  } catch (e) {
    console.error('[chat] unexpected error', e);
    return err(500, 'INTERNAL', 'The assistant hit an internal error.');
  }
}
