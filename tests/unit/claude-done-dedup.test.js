import { describe, expect, it } from "vitest";

import { claudeToOpenAIResponse } from "../../open-sse/translator/response/claude-to-openai.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { createSSETransformStreamWithLogger } from "../../open-sse/utils/stream.js";

async function runClaudeTransform(input) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(input));
      controller.close();
    },
  });

  const output = stream.pipeThrough(
    createSSETransformStreamWithLogger(
      FORMATS.CLAUDE,
      FORMATS.OPENAI,
      "claude",
      null,
      null,
      "claude-opus-4.8",
    ),
  );

  const reader = output.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

describe("Claude to OpenAI SSE termination", () => {
  it("emits one DONE when upstream also sends DONE before stream close", async () => {
    const output = await runClaudeTransform([
      `data: ${JSON.stringify({ type: "message_start", message: { id: "msg_test", model: "claude-opus-4.8" } })}`,
      "",
      `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}`,
      "",
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I'll check that for you." } })}`,
      "",
      `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
      "",
      `data: ${JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "get_weather", input: {} } })}`,
      "",
      `data: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"city\":\"Hanoi\"}" } })}`,
      "",
      `data: ${JSON.stringify({ type: "content_block_stop", index: 1 })}`,
      "",
      `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { input_tokens: 10, output_tokens: 5 } })}`,
      "",
      `data: ${JSON.stringify({ type: "message_stop" })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n"));

    expect(output).toContain("I'll check that for you.");
    expect(output).toContain('"tool_calls"');
    expect(output.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it("emits empty JSON arguments for zero-argument Claude tool calls", () => {
    const state = {
      messageId: null,
      model: null,
      toolCallIndex: 0,
      toolCalls: new Map(),
      finishReasonSent: false,
    };
    const chunks = [
      { type: "message_start", message: { id: "msg_empty_args", model: "claude-opus-4.8" } },
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_empty", name: "list_files", input: {} } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "tool_use" } },
      { type: "message_stop" },
    ];

    const output = chunks.flatMap((chunk) => claudeToOpenAIResponse(chunk, state) || []);

    expect(JSON.stringify(output)).toContain('"arguments":"{}"');
  });
});
