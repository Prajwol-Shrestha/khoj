import type { AgentStep } from "@/lib/types";
import Groq from "groq-sdk";
import type { CompletionUsage } from "groq-sdk/resources/completions";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const MODEL = "qwen/qwen3.8-27b";
const MAX_STEPS = 4;

type Message = Groq.Chat.ChatCompletionMessageParam;
type ToolChoice = "auto" | "required" | "none";

export interface AgentTool {
  name: string;
  definition: Groq.Chat.ChatCompletionTool;
  // content goes back to the model, outcome is the short line shown in the UI
  run: (
    args: Record<string, unknown>,
  ) => Promise<{ content: string; outcome: string }>;
}

// every tool gets a required `reason`, listed first so the model explains itself
// before filling in the rest. the UI shows it as the agent's thinking
export function defineTool(
  name: string,
  description: string,
  params: Record<string, { type: string; description: string }>,
  run: AgentTool["run"],
): AgentTool {
  const reason = {
    type: "string",
    description: "One short sentence: what you need and why you call this tool.",
  };
  return {
    name,
    run,
    definition: {
      type: "function",
      function: {
        name,
        description,
        parameters: {
          type: "object",
          properties: { reason, ...params },
          required: ["reason", ...Object.keys(params)],
        },
      },
    },
  };
}

// tool calls arrive in pieces, stitched together by index
async function streamPass(
  messages: Message[],
  tools: AgentTool[],
  toolChoice: ToolChoice,
  onToken: (token: string) => void,
) {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages,
    tools: tools.map((t) => t.definition),
    tool_choice: toolChoice,
    max_completion_tokens: 2048,
    temperature: 0.3,
    stream: true,
    reasoning_effort: "default",
  });

  let content = "";
  let tokensUsed = 0;
  const calls: { id: string; name: string; arguments: string }[] = [];

  for await (const chunk of completion) {
    const delta = chunk.choices[0]?.delta;

    if (delta?.content) {
      content += delta.content;
      onToken(delta.content);
    }

    for (const piece of delta?.tool_calls ?? []) {
      const call = (calls[piece.index] ??= { id: "", name: "", arguments: "" });
      if (piece.id) call.id = piece.id;
      if (piece.function?.name) call.name += piece.function.name;
      if (piece.function?.arguments) call.arguments += piece.function.arguments;
    }

    // groq puts usage on the last chunk
    if ("usage" in chunk && chunk.usage) {
      tokensUsed = (chunk.usage as CompletionUsage).total_tokens;
    }
  }

  return { content, calls, tokensUsed };
}

// text streamed before a tool call is the model thinking aloud, not the answer,
// so callers should drop what onToken gave them when onStep fires
export async function runAgent(opts: {
  system: string;
  history: { role: "user" | "assistant"; content: string }[];
  tools: AgentTool[];
  onToken: (token: string) => void;
  onStep: (step: AgentStep) => void;
}): Promise<{ answer: string; tokensUsed: number }> {
  const messages: Message[] = [
    { role: "system", content: opts.system },
    ...opts.history,
  ];
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  let tokensUsed = 0;

  for (let round = 1; round <= MAX_STEPS + 1; round++) {
    // first round has to use a tool, otherwise the model sometimes says "not
    // found" without looking. last round can't, so there's always an answer.
    const toolChoice =
      round > MAX_STEPS ? "none" : round === 1 ? "required" : "auto";

    const pass = await streamPass(messages, opts.tools, toolChoice, opts.onToken);
    tokensUsed += pass.tokensUsed;

    if (pass.calls.length === 0) return { answer: pass.content, tokensUsed };

    messages.push({
      role: "assistant",
      content: pass.content,
      tool_calls: pass.calls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.arguments },
      })),
    });

    for (const call of pass.calls) {
      let args: Record<string, unknown> = {};
      let result: { content: string; outcome: string };
      try {
        const tool = byName.get(call.name);
        if (!tool) throw new Error(`Unknown tool: ${call.name}`);
        args = JSON.parse(call.arguments || "{}");
        result = await tool.run(args);
      } catch (error) {
        console.error(`Tool ${call.name} failed:`, error);
        const message = error instanceof Error ? error.message : String(error);
        result = { content: `Error: ${message}`, outcome: `failed: ${message}` };
      }

      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
      opts.onStep({
        tool: call.name,
        reason: typeof args.reason === "string" ? args.reason : undefined,
        query: typeof args.query === "string" ? args.query : undefined,
        outcome: result.outcome,
      });
    }
  }

  throw new Error("Agent loop ended without an answer");
}
