/**
 * Unit tests for open-sse/translator/request/openai-to-claude.js
 *
 * Tests cover:
 *  - openaiToClaudeRequest() - OpenAI to Claude request translation
 *  - Response format handling (json_schema, json_object)
 */

import { describe, it, expect } from "vitest";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.js";
import { prepareClaudeRequest } from "../../open-sse/translator/helpers/claudeHelper.js";
import { openaiToClaudeResponse } from "../../open-sse/translator/response/openai-to-claude.js";

describe("openaiToClaudeRequest", () => {
  describe("response_format handling", () => {
    it("should inject JSON schema instructions for json_schema type", () => {
      const body = {
        messages: [{ role: "user", content: "What is 2+2?" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "math_response",
            schema: {
              type: "object",
              properties: {
                answer: { type: "number" },
                explanation: { type: "string" }
              },
              required: ["answer", "explanation"]
            }
          }
        }
      };

      const result = openaiToClaudeRequest("claude-sonnet-4.5", body, false);

      // Should have system array with instructions
      expect(result.system).toBeDefined();
      expect(Array.isArray(result.system)).toBe(true);
      
      // Check that system prompt includes schema
      const systemText = result.system
        .filter(s => s.type === "text")
        .map(s => s.text)
        .join("\n");
      
      expect(systemText).toContain("You must respond with valid JSON");
      expect(systemText).toContain("\"answer\"");
      expect(systemText).toContain("\"explanation\"");
      expect(systemText).toContain("Respond ONLY with the JSON object");
    });

    it("should inject basic JSON instructions for json_object type", () => {
      const body = {
        messages: [{ role: "user", content: "Give me a JSON object" }],
        response_format: {
          type: "json_object"
        }
      };

      const result = openaiToClaudeRequest("claude-sonnet-4.5", body, false);

      // Should have system array with instructions
      expect(result.system).toBeDefined();
      expect(Array.isArray(result.system)).toBe(true);
      
      const systemText = result.system
        .filter(s => s.type === "text")
        .map(s => s.text)
        .join("\n");
      
      expect(systemText).toContain("You must respond with valid JSON");
      expect(systemText).toContain("Respond ONLY with a JSON object");
    });

    it("should not modify system prompt when response_format is missing", () => {
      const body = {
        messages: [{ role: "user", content: "Hello" }]
      };

      const result = openaiToClaudeRequest("claude-sonnet-4.5", body, false);

      // Should have system but without JSON instructions
      expect(result.system).toBeDefined();
      
      const systemText = result.system
        .filter(s => s.type === "text")
        .map(s => s.text)
        .join("\n");
      
      // Should NOT contain JSON-specific instructions
      expect(systemText).not.toContain("You must respond with valid JSON");
    });

    it("should preserve existing system messages when adding response_format", () => {
      const body = {
        messages: [
          { role: "system", content: "You are a helpful math tutor." },
          { role: "user", content: "What is 2+2?" }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            schema: {
              type: "object",
              properties: {
                result: { type: "number" }
              }
            }
          }
        }
      };

      const result = openaiToClaudeRequest("claude-sonnet-4.5", body, false);

      // Should preserve original system message
      const systemText = result.system
        .filter(s => s.type === "text")
        .map(s => s.text)
        .join("\n");
      
      expect(systemText).toContain("You are a helpful math tutor");
      expect(systemText).toContain("You must respond with valid JSON");
    });
  });

  describe("tool result handling", () => {
    it("preserves string tool output when converting OpenAI tool messages", () => {
      const result = openaiToClaudeRequest("claude-sonnet-4.5", {
        messages: [
          { role: "user", content: "test echo" },
          { role: "assistant", content: null, tool_calls: [{ id: "call_echo", type: "function", function: { name: "Shell", arguments: "{}" } }] },
          { role: "tool", tool_call_id: "call_echo", content: "HELLO_WORLD_123" },
        ],
      }, false);

      const toolResult = result.messages
        .flatMap(message => message.content || [])
        .find(block => block.type === "tool_result");

      expect(toolResult).toMatchObject({
        type: "tool_result",
        tool_use_id: "call_echo",
        content: "HELLO_WORLD_123",
      });
    });

    it("normalizes OpenAI-style array tool output to Claude text content", () => {
      const result = openaiToClaudeRequest("claude-sonnet-4.5", {
        messages: [
          { role: "user", content: "test echo" },
          { role: "assistant", content: null, tool_calls: [{ id: "call_echo", type: "function", function: { name: "Shell", arguments: "{}" } }] },
          { role: "tool", tool_call_id: "call_echo", content: [{ type: "text", text: "HELLO_WORLD_123" }] },
        ],
      }, false);

      const toolResult = result.messages
        .flatMap(message => message.content || [])
        .find(block => block.type === "tool_result");

      expect(toolResult.content).toBe("HELLO_WORLD_123");
    });

    it("normalizes Claude-native array tool_result content during request preparation", () => {
      const result = prepareClaudeRequest({
        messages: [
          { role: "assistant", content: [{ type: "tool_use", id: "call_echo", name: "Shell", input: {} }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "call_echo", content: [{ type: "text", text: "HELLO_WORLD_123" }] }] },
        ],
      }, "claude");

      const toolResult = result.messages
        .flatMap(message => message.content || [])
        .find(block => block.type === "tool_result");

      expect(toolResult.content).toBe("HELLO_WORLD_123");
    });

    it("converts Bedrock Converse toolResult blocks to Claude-native tool_result", () => {
      const result = openaiToClaudeRequest("claude-sonnet-4.5", {
        messages: [
          { role: "assistant", content: [{ type: "tool_use", id: "toolu_bedrock", name: "Shell", input: {} }] },
          { role: "user", content: [{ toolResult: { toolUseId: "toolu_bedrock", status: "success", content: [{ text: "BEDROCK_RESULT_123" }] } }] },
        ],
      }, false);

      const toolResult = result.messages
        .flatMap(message => message.content || [])
        .find(block => block.type === "tool_result");

      expect(toolResult).toMatchObject({
        type: "tool_result",
        tool_use_id: "toolu_bedrock",
        content: "BEDROCK_RESULT_123",
      });
    });

    it("normalizes Bedrock Converse toolResult content during request preparation", () => {
      const result = prepareClaudeRequest({
        messages: [
          { role: "assistant", content: [{ type: "tool_use", id: "toolu_bedrock", name: "Shell", input: {} }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_bedrock", content: [{ toolUseId: "toolu_bedrock", status: "success", content: [{ text: "BEDROCK_RESULT_123" }] }] }] },
        ],
      }, "claude");

      const toolResult = result.messages
        .flatMap(message => message.content || [])
        .find(block => block.type === "tool_result");

      expect(toolResult.content).toBe("BEDROCK_RESULT_123");
    });
  });

  describe("tool_choice handling", () => {
    const baseBody = {
      messages: [{ role: "user", content: "add a todo" }],
      tools: [{
        type: "function",
        function: { name: "todo_write", description: "write todos", parameters: { type: "object", properties: {} } }
      }]
    };

    const choiceOf = (tc) =>
      openaiToClaudeRequest("claude-sonnet-4.5", { ...baseBody, tool_choice: tc }, false).tool_choice;

    it("converts OpenAI forced tool ({type:'function'}) to Claude {type:'tool'}", () => {
      // Must NOT leak the OpenAI "function" type — Claude only accepts auto|any|tool|none.
      expect(choiceOf({ type: "function", function: { name: "todo_write" } }))
        .toEqual({ type: "tool", name: "todo_write" });
    });

    it("maps string tool_choice values", () => {
      expect(choiceOf("auto")).toEqual({ type: "auto" });
      expect(choiceOf("none")).toEqual({ type: "auto" });
      expect(choiceOf("required")).toEqual({ type: "any" });
    });

    it("passes through Claude-native tool_choice objects unchanged", () => {
      expect(choiceOf({ type: "tool", name: "todo_write" })).toEqual({ type: "tool", name: "todo_write" });
      expect(choiceOf({ type: "any" })).toEqual({ type: "any" });
      expect(choiceOf({ type: "none" })).toEqual({ type: "none" });
    });

    it("never leaks an invalid type (falls back to auto)", () => {
      // Malformed forced choice with no tool name, and unknown types, must not
      // pass an invalid `type` through to Claude.
      expect(choiceOf({ type: "function", function: {} })).toEqual({ type: "auto" });
      expect(choiceOf({ type: "function" })).toEqual({ type: "auto" });
      expect(choiceOf({ type: "bogus" })).toEqual({ type: "auto" });
    });

    it("omits tool_choice entirely when the request has none", () => {
      const result = openaiToClaudeRequest("claude-sonnet-4.5", baseBody, false);
      expect(result.tool_choice).toBeUndefined();
    });
  });
});

describe("openaiToClaudeResponse", () => {
  it("omits empty Read pages tool argument before emitting Claude input deltas", () => {
    const state = { toolCalls: new Map() };
    const chunk = {
      id: "chatcmpl-test",
      model: "gpt-test",
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "call_read",
            function: {
              name: "Read",
              arguments: JSON.stringify({
                file_path: "/tmp/example.txt",
                offset: 0,
                limit: 120,
                pages: ""
              })
            }
          }]
        }
      }]
    };

    const result = openaiToClaudeResponse(chunk, state);
    const inputDelta = result.find(event => event.delta?.type === "input_json_delta");

    expect(inputDelta).toBeDefined();
    expect(JSON.parse(inputDelta.delta.partial_json)).toEqual({
      file_path: "/tmp/example.txt",
      offset: 0,
      limit: 120
    });
  });
});
