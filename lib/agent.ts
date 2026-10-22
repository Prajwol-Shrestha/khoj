import type { AgentStep } from "@/lib/types";
import Groq from "groq-sdk";
import type { CompletionUsage } from "groq-sdk/resources/completions";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const MODEL = "openai/gpt-oss-120b";
const MAX_STEPS = 4;

type Message = Groq.Chat.ChatCompletionMessageParam;
type ToolCall = Groq.Chat.ChatCompletionMessageToolCall;
type ToolResult = { content: string; outcome: string };

export interface AgentTool {
  name: string;
  definition: Groq.Chat.ChatCompletionTool;
  // content goes back to the model, outcome is the short line shown in the UI
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
}

// `reason` is listed first so the model explains itself before filling in the rest
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

async function streamPass(
  messages: Message[],
  tools: AgentTool[],
  toolChoice: "auto" | "none",
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
    reasoning_effort: "low",
  });

  let content = "";
  let tokensUsed = 0;
  const calls: ToolCall[] = [];

  for await (const chunk of completion) {
    const delta = chunk.choices[0]?.delta;

    if (delta?.content) {
      content += delta.content;
      onToken(delta.content);
    }

    for (const piece of delta?.tool_calls ?? []) {
      const call = (calls[piece.index] ??= {
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      });
      if (piece.id) call.id = piece.id;
      if (piece.function?.name) call.function.name += piece.function.name;
      if (piece.function?.arguments) call.function.arguments += piece.function.arguments;
    }

    // groq puts usage on the last chunk
    if ("usage" in chunk && chunk.usage) {
      tokensUsed = (chunk.usage as CompletionUsage).total_tokens;
    }
  }

  return { content, calls, tokensUsed };
}

// a failing tool becomes a result, so the model can read the error and try something else
async function runTool(tool: AgentTool | undefined, call: ToolCall) {
  let args: Record<string, unknown> = {};
  try {
    if (!tool) throw new Error(`Unknown tool: ${call.function.name}`);
    args = JSON.parse(call.function.arguments || "{}");
    return { args, result: await tool.run(args) };
  } catch (error) {
    console.error(`Tool ${call.function.name} failed:`, error);
    const message = error instanceof Error ? error.message : String(error);
    const result = { content: `Error: ${message}`, outcome: `failed: ${message.slice(0, 120)}` };
    return { args, result };
  }
}

export async function runAgent(opts: {
  system: string;
  history: { role: "user" | "assistant"; content: string }[];
  tools: AgentTool[];
  onToken: (token: string) => void;
  // fires after each tool call. text streamed before it was the model thinking aloud
  onStep: (step: AgentStep) => void;
}): Promise<{ answer: string; tokensUsed: number }> {
  const messages: Message[] = [{ role: "system", content: opts.system }, ...opts.history];
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  let tokensUsed = 0;

  for (let round = 0; round <= MAX_STEPS; round++) {
    // the last round has no tools, so the loop always ends in an answer
    const toolChoice = round === MAX_STEPS ? "none" : "auto";
    const pass = await streamPass(messages, opts.tools, toolChoice, opts.onToken);
    tokensUsed += pass.tokensUsed;

    if (pass.calls.length === 0) return { answer: pass.content, tokensUsed };

    messages.push({ role: "assistant", content: pass.content, tool_calls: pass.calls });

    for (const call of pass.calls) {
      const { args, result } = await runTool(byName.get(call.function.name), call);
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
      opts.onStep({
        tool: call.function.name,
        reason: typeof args.reason === "string" ? args.reason : undefined,
        query: typeof args.query === "string" ? args.query : undefined,
        outcome: result.outcome,
      });
    }
  }

  throw new Error("Agent loop ended without an answer");
}
