import "dotenv/config";

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type OpenAIResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const isEnabled = () => Boolean(OPENAI_API_KEY);

const callOpenAI = async (messages: OpenAIMessage[], temperature = 0.4) => {
  if (!OPENAI_API_KEY) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature,
      max_tokens: 400,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as OpenAIResponse;
  const content = payload.choices?.[0]?.message?.content;
  return content ?? null;
};

const parseJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    return null;
  }
};

export const aiEnabled = () => isEnabled();

export const generateTemplateDraft = async (message: string) => {
  if (!isEnabled()) return null;
  const prompt = `
You are helping draft a birthday email template.
Return JSON with keys "subject" and "content" (plain text, no HTML).
Keep it warm, friendly, and under 120 words.
User message: """${message}"""
`;

  const response = await callOpenAI(
    [
      { role: "system", content: "You write concise, friendly email copy." },
      { role: "user", content: prompt },
    ],
    0.5
  );

  const data = parseJson<{ subject?: string; content?: string }>(response);
  if (!data?.subject || !data?.content) return null;
  return { subject: data.subject.trim(), content: data.content.trim() };
};

export const generatePersonalizedIntro = async (input: {
  fullName: string;
  firstName?: string | null;
  role?: string | null;
  department?: string | null;
  organizationName?: string | null;
}) => {
  if (!isEnabled()) return null;
  const prompt = `
Write one short, friendly sentence to personalize a birthday email intro.
Use the person's role/department if provided. Do not include emojis.
Return JSON as {"intro": "..."}.
Person:
- Full name: ${input.fullName}
- First name: ${input.firstName || ""}
- Role: ${input.role || ""}
- Department: ${input.department || ""}
- Organization: ${input.organizationName || ""}
`;

  const response = await callOpenAI(
    [
      { role: "system", content: "You write short, tasteful personalization lines." },
      { role: "user", content: prompt },
    ],
    0.3
  );

  const data = parseJson<{ intro?: string }>(response);
  if (!data?.intro) return null;
  return data.intro.trim();
};

export const generateCsvSuggestions = async (input: {
  headers: string[];
  errors: Array<{ row: number; message: string }>;
}) => {
  if (!isEnabled()) return null;
  const prompt = `
Provide 2-4 concise CSV fix suggestions based on headers and errors.
Return JSON as {"suggestions": ["...", "..."]}.
Headers: ${input.headers.join(", ")}
Errors: ${input.errors.map((err) => `Row ${err.row}: ${err.message}`).join(" | ")}
`;

  const response = await callOpenAI(
    [
      { role: "system", content: "You diagnose CSV import issues." },
      { role: "user", content: prompt },
    ],
    0.2
  );

  const data = parseJson<{ suggestions?: string[] }>(response);
  if (!data?.suggestions?.length) return null;
  return data.suggestions.map((item) => item.trim()).filter(Boolean);
};
