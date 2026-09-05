import { MOCK_ASSISTANT_RESPONSE } from "@/lib/mockData";
import { uid } from "@/lib/utils";
import type { CitationDto, ChatStreamHandlers } from "@/lib/api";

const TOKEN_DELAY_MS = 26;

/**
 * Simulated SSE stream that mirrors backend/app/api/v1/chat.py's event
 * cadence (token -> citations -> done). Used when the API server is
 * unreachable so the conversational UI stays demoable offline.
 */
export async function simulateChatStream(handlers: ChatStreamHandlers): Promise<void> {
  const content = MOCK_ASSISTANT_RESPONSE.content;
  const chunks = content.match(/[\s\S]{1,18}/g) ?? [content];

  for (const chunk of chunks) {
    await new Promise((resolve) => setTimeout(resolve, TOKEN_DELAY_MS));
    handlers.onToken(chunk);
  }

  handlers.onCitations(MOCK_ASSISTANT_RESPONSE.citations as CitationDto[]);
  handlers.onDone(uid("msg"), uid("session"));
}
