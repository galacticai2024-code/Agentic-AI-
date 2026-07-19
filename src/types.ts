/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  enabled: boolean;
  category: 'search' | 'utility' | 'database' | 'weather';
}

export interface AgentConfig {
  model: string;
  systemPrompt: string;
  temperature: number;
  maxIterations: number;
  enabledTools: string[];
}

export type StepType = 'thought' | 'tool_call' | 'observation' | 'final_answer' | 'error' | 'system_log';

export interface AgentStep {
  id: string;
  type: StepType;
  title: string;
  content: string;
  timestamp: string;
  durationMs?: number;
  metadata?: Record<string, any>;
}

export interface AgentRunResponse {
  success: boolean;
  finalAnswer: string;
  steps: AgentStep[];
  executionTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  createdAt: string;
}
