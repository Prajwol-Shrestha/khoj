import type { AgentStep, SourceChunkData } from "@/lib/types";

export type ChatStreamEvent =
  | { type: "sources"; sources: SourceChunkData[] }
  | { type: "step"; step: AgentStep }
  | { type: "token"; content: string }
  | { type: "error"; message: string }
  | { type: "done" };

const encoder = new TextEncoder();

export function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function* readEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // finally, so a consumer that breaks early or throws doesn't leave the socket open
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        try {
          yield JSON.parse(frame.slice(6)) as ChatStreamEvent;
        } catch {
          console.error("Ignoring malformed stream frame:", frame);
        }
      }
    }
  } finally {
    await reader.cancel();
  }
}
