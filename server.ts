/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createServer as createViteServer } from 'vite';
import { AgentConfig, AgentStep, AgentRunResponse, MemoryItem } from './src/types.js';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

// In-memory Agent Database Memory Store
const memoryStore: MemoryItem[] = [
  {
    id: 'mem_1',
    key: 'project_status',
    value: 'AI Agent Studio prototype is active. Deployable to Render and Streamlit.',
    createdAt: new Date().toISOString()
  },
  {
    id: 'mem_2',
    key: 'system_instructions',
    value: 'Always keep answers structured and provide step-by-step reasoning.',
    createdAt: new Date().toISOString()
  }
];

// Helper to sanitize and evaluate a mathematical expression safely
function safeEvaluateMath(expression: string): string {
  try {
    // Keep only allowed math characters to avoid arbitrary code execution
    const sanitized = expression.replace(/[^0-9+\-*/().\s^%]/g, '');
    if (!sanitized.trim()) {
      return 'Error: Invalid math expression characters';
    }
    // Replace ^ with ** for JavaScript power operator
    const evalFriendly = sanitized.replace(/\^/g, '**');
    
    // Safely evaluate using Function constructor with no global scope exposure
    const result = new Function(`return (${evalFriendly})`)();
    
    if (result === undefined || isNaN(result) || !isFinite(result)) {
      return 'Error: Computation resulted in an invalid number';
    }
    return String(result);
  } catch (err: any) {
    return `Error evaluating expression: ${err.message}`;
  }
}

// Major cities geolocation data for Open-Meteo weather API
const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  'new york': { lat: 40.7128, lon: -74.0060 },
  'london': { lat: 51.5074, lon: -0.1278 },
  'tokyo': { lat: 35.6762, lon: 139.6503 },
  'paris': { lat: 48.8566, lon: 2.3522 },
  'sydney': { lat: -33.8688, lon: 151.2093 },
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  'berlin': { lat: 52.5200, lon: 13.4050 },
  'mumbai': { lat: 19.0760, lon: 72.8777 },
  'delhi': { lat: 28.6139, lon: 77.2090 },
  'singapore': { lat: 1.3521, lon: 103.8198 },
  'toronto': { lat: 43.6532, lon: -79.3832 },
  'dubai': { lat: 25.2048, lon: 55.2708 },
  'cairo': { lat: 30.0444, lon: 31.2357 },
  'cape town': { lat: -33.9249, lon: 18.4241 },
  'sao paulo': { lat: -23.5505, lon: -46.6333 },
};

// Tool implementations
const toolsList = {
  async web_search(query: string): Promise<string> {
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
      const response = await fetch(searchUrl);
      const data = await response.json();
      
      const results = data?.query?.search;
      if (!results || results.length === 0) {
        return `Search for "${query}" yielded no results on Wikipedia.`;
      }

      const formattedResults = results.slice(0, 3).map((item: any, idx: number) => {
        // Strip HTML tags from the snippet
        const snippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, "");
        return `Result [${idx + 1}]: Title: "${item.title}"\nSnippet: ${snippet}\nUrl: https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`;
      }).join('\n\n');

      return `Top search results for "${query}":\n\n${formattedResults}`;
    } catch (error: any) {
      return `Failed to perform web search: ${error.message}`;
    }
  },

  calculator(expression: string): string {
    const result = safeEvaluateMath(expression);
    return `Mathematical calculation result of "${expression}" is: ${result}`;
  },

  async get_weather(city: string): Promise<string> {
    const cleanCity = city.toLowerCase().trim();
    let lat = 40.7128;
    let lon = -74.0060;
    let resolvedCity = 'New York (Default)';

    const match = Object.keys(CITY_COORDINATES).find(c => cleanCity.includes(c) || c.includes(cleanCity));
    if (match) {
      lat = CITY_COORDINATES[match].lat;
      lon = CITY_COORDINATES[match].lon;
      resolvedCity = match.charAt(0).toUpperCase() + match.slice(1);
    } else {
      // Generate deterministic lat/lon for unknown city
      resolvedCity = city;
      let hash = 0;
      for (let i = 0; i < cleanCity.length; i++) {
        hash = cleanCity.charCodeAt(i) + ((hash << 5) - hash);
      }
      lat = (hash % 90);
      lon = (hash % 180);
    }

    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
      const response = await fetch(weatherUrl);
      const data = await response.json();

      if (!data || !data.current_weather) {
        return `Could not load weather details for ${resolvedCity}.`;
      }

      const current = data.current_weather;
      return `Weather details for ${resolvedCity} (lat: ${lat.toFixed(2)}, lon: ${lon.toFixed(2)}):
- Temperature: ${current.temperature}°C
- Wind Speed: ${current.windspeed} km/h
- Wind Direction: ${current.winddirection}°
- Weather Code: ${current.weathercode} (Conditions: ${getWeatherConditionFromCode(current.weathercode)})
- Checked At: ${current.time}`;
    } catch (error: any) {
      return `Failed to fetch real weather info for "${city}": ${error.message}`;
    }
  },

  database_store(key: string, value: string): string {
    const cleanKey = key.trim().toLowerCase();
    const existingIdx = memoryStore.findIndex(m => m.key === cleanKey);
    
    if (existingIdx !== -1) {
      memoryStore[existingIdx].value = value;
      memoryStore[existingIdx].createdAt = new Date().toISOString();
    } else {
      memoryStore.push({
        id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        key: cleanKey,
        value,
        createdAt: new Date().toISOString()
      });
    }
    return `Successfully stored memory key "${cleanKey}" with value: "${value}"`;
  },

  database_search(query: string): string {
    const cleanQuery = query.toLowerCase().trim();
    const matches = memoryStore.filter(m => m.key.includes(cleanQuery) || m.value.toLowerCase().includes(cleanQuery));
    
    if (matches.length === 0) {
      return `No memories matching "${query}" were found. Try saving a memory first using database_store.`;
    }

    const formatted = matches.map((item, idx) => {
      return `[Memory ${idx + 1}]: Key: "${item.key}"\nValue: "${item.value}"\nSaved on: ${item.createdAt}`;
    }).join('\n\n');

    return `Found ${matches.length} matching memory item(s):\n\n${formatted}`;
  },

  get_current_time(): string {
    const date = new Date();
    return `Current date and time:
- ISO string: ${date.toISOString()}
- Local time: ${date.toLocaleString()}
- Weekday: ${date.toLocaleDateString(undefined, { weekday: 'long' })}
- System timezone offset: ${date.getTimezoneOffset()} minutes`;
  }
};

// Weather code mapping helper
function getWeatherConditionFromCode(code: number): string {
  if (code === 0) return 'Clear sky ☀️';
  if (code === 1 || code === 2 || code === 3) return 'Mainly clear, partly cloudy, or overcast ⛅';
  if (code === 45 || code === 48) return 'Foggy 🌫️';
  if (code === 51 || code === 53 || code === 55) return 'Drizzle 🌧️';
  if (code === 61 || code === 63 || code === 65) return 'Rainy 🌧️☔';
  if (code === 71 || code === 73 || code === 75) return 'Snowy ❄️☃️';
  if (code === 80 || code === 81 || code === 82) return 'Rain showers 🌦️';
  if (code === 95 || code === 96 || code === 99) return 'Thunderstorm ⛈️🌩️';
  return 'Unknown weather code';
}

// REST API Endpoints

// 1. Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 2. Fetch all memories
app.get('/api/memory', (req: Request, res: Response) => {
  res.json({ memories: memoryStore });
});

// 3. Delete memory
app.delete('/api/memory/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = memoryStore.findIndex(m => m.id === id);
  if (idx !== -1) {
    const deleted = memoryStore.splice(idx, 1)[0];
    res.json({ success: true, message: `Memory "${deleted.key}" deleted.` });
  } else {
    res.status(404).json({ success: false, message: 'Memory not found' });
  }
});

// 4. Run the Agent Loop with tool calling
app.post('/api/agent/run', async (req: Request, res: Response) => {
  const { prompt, config } = req.body as { prompt: string; config: AgentConfig };
  
  if (!prompt || !prompt.trim()) {
    res.status(400).json({ success: false, error: 'User prompt is required' });
    return;
  }

  const agentConfig: AgentConfig = {
    model: config?.model || 'llama-3.3-70b-versatile',
    systemPrompt: config?.systemPrompt || 'You are a highly efficient task automation agent. Use tools strategically to answer queries step-by-step.',
    temperature: typeof config?.temperature === 'number' ? config.temperature : 0.2,
    maxIterations: config?.maxIterations || 5,
    enabledTools: config?.enabledTools || ['web_search', 'calculator', 'get_weather', 'database_store', 'database_search', 'get_current_time']
  };

  // Check API Key
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('MY_GEMINI_API_KEY')) {
    res.status(401).json({
      success: false,
      error: 'GROQ_API_KEY environment variable is not configured or is empty. Please set a valid key.'
    });
    return;
  }

  const steps: AgentStep[] = [];
  const startTime = Date.now();
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const groq = new Groq({ apiKey });

    // Define tools matching Groq Schema
    const groqTools: any[] = [];
    
    if (agentConfig.enabledTools.includes('web_search')) {
      groqTools.push({
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Searches the web for facts, current events, and up-to-date general knowledge.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The search query to look up.' }
            },
            required: ['query']
          }
        }
      });
    }

    if (agentConfig.enabledTools.includes('calculator')) {
      groqTools.push({
        type: 'function',
        function: {
          name: 'calculator',
          description: 'Evaluates basic mathematical expressions. Supports addition, subtraction, multiplication, division, power, and parentheses.',
          parameters: {
            type: 'object',
            properties: {
              expression: { type: 'string', description: 'The math expression to evaluate, e.g., "123 * (45 + 67)"' }
            },
            required: ['expression']
          }
        }
      });
    }

    if (agentConfig.enabledTools.includes('get_weather')) {
      groqTools.push({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Gets current weather details, temperature, and conditions for a specific city.',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'The name of the city, e.g., "London", "Tokyo"' }
            },
            required: ['city']
          }
        }
      });
    }

    if (agentConfig.enabledTools.includes('database_store')) {
      groqTools.push({
        type: 'function',
        function: {
          name: 'database_store',
          description: 'Saves an important piece of information, note, or memory in the agent\'s long-term database.',
          parameters: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'The memory lookup key name (lowercase, no spaces).' },
              value: { type: 'string', description: 'The detailed value to store.' }
            },
            required: ['key', 'value']
          }
        }
      });
    }

    if (agentConfig.enabledTools.includes('database_search')) {
      groqTools.push({
        type: 'function',
        function: {
          name: 'database_search',
          description: 'Searches the agent\'s database memory for a specific key or topic saved previously.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The key name or search text.' }
            },
            required: ['query']
          }
        }
      });
    }

    if (agentConfig.enabledTools.includes('get_current_time')) {
      groqTools.push({
        type: 'function',
        function: {
          name: 'get_current_time',
          description: 'Returns the current local and UTC date and time.',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      });
    }

    // Initialize messages list
    const messages: any[] = [
      { role: 'system', content: agentConfig.systemPrompt },
      { role: 'user', content: prompt }
    ];

    steps.push({
      id: `step_${Date.now()}_init`,
      type: 'system_log',
      title: 'Agent Initialization',
      content: `Initialized LLM Agent with model: **${agentConfig.model}**\nTemperature: ${agentConfig.temperature}\nTools allowed: ${agentConfig.enabledTools.join(', ')}`,
      timestamp: new Date().toISOString()
    });

    let iteration = 0;
    let finalAnswer = '';
    let shouldContinue = true;

    while (shouldContinue && iteration < agentConfig.maxIterations) {
      iteration++;
      const stepStartTime = Date.now();
      
      steps.push({
        id: `step_${Date.now()}_iter_${iteration}`,
        type: 'system_log',
        title: `Iteration ${iteration} Start`,
        content: `Running LLM completion to determine next action...`,
        timestamp: new Date().toISOString()
      });

      // Run chat completion with or without tools
      const completionParams: any = {
        model: agentConfig.model,
        messages,
        temperature: agentConfig.temperature,
      };

      if (groqTools.length > 0) {
        completionParams.tools = groqTools;
        completionParams.tool_choice = 'auto';
      }

      const response = await groq.chat.completions.create(completionParams);
      
      const choice = response.choices[0];
      const message = choice.message;
      
      if (response.usage) {
        promptTokens += response.usage.prompt_tokens || 0;
        completionTokens += response.usage.completion_tokens || 0;
      }

      // Add agent's response to history
      messages.push(message);

      // Extract thought (if LLM returned content text)
      if (message.content) {
        steps.push({
          id: `step_${Date.now()}_thought_${iteration}`,
          type: 'thought',
          title: `Reasoning Thought (Step ${iteration})`,
          content: message.content,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - stepStartTime
        });
        finalAnswer = message.content;
      }

      // Check if LLM requested any Tool Calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCalls = message.tool_calls;
        
        steps.push({
          id: `step_${Date.now()}_toolcall_${iteration}`,
          type: 'system_log',
          title: 'Planning Tools',
          content: `Model requested execution of **${toolCalls.length} tool(s)**.`,
          timestamp: new Date().toISOString()
        });

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolArgsStr = toolCall.function.arguments;
          let parsedArgs: any = {};
          
          try {
            parsedArgs = JSON.parse(toolArgsStr);
          } catch (e) {
            parsedArgs = toolArgsStr;
          }

          steps.push({
            id: `step_call_${toolCall.id}`,
            type: 'tool_call',
            title: `Executing Tool: ${toolName}`,
            content: `Arguments: \`\`\`json\n${JSON.stringify(parsedArgs, null, 2)}\n\`\`\``,
            timestamp: new Date().toISOString(),
            metadata: { toolName, args: parsedArgs, toolCallId: toolCall.id }
          });

          const toolExecStart = Date.now();
          let observation = '';

          // Execute matching tool
          try {
            if (toolName === 'web_search') {
              observation = await toolsList.web_search(parsedArgs.query || '');
            } else if (toolName === 'calculator') {
              observation = toolsList.calculator(parsedArgs.expression || '');
            } else if (toolName === 'get_weather') {
              observation = await toolsList.get_weather(parsedArgs.city || '');
            } else if (toolName === 'database_store') {
              observation = toolsList.database_store(parsedArgs.key || '', parsedArgs.value || '');
            } else if (toolName === 'database_search') {
              observation = toolsList.database_search(parsedArgs.query || '');
            } else if (toolName === 'get_current_time') {
              observation = toolsList.get_current_time();
            } else {
              observation = `Error: Tool "${toolName}" is not registered.`;
            }
          } catch (err: any) {
            observation = `Error executing tool: ${err.message}`;
          }

          const toolDuration = Date.now() - toolExecStart;

          // Push observation step
          steps.push({
            id: `step_obs_${toolCall.id}`,
            type: 'observation',
            title: `Observation: ${toolName}`,
            content: observation,
            timestamp: new Date().toISOString(),
            durationMs: toolDuration,
            metadata: { toolCallId: toolCall.id }
          });

          // Send back tool results to conversation history
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: observation
          });
        }
      } else {
        // No tool calls means the model finished reasoning and answered
        shouldContinue = false;
        
        steps.push({
          id: `step_${Date.now()}_answer`,
          type: 'final_answer',
          title: 'Final Output Generated',
          content: finalAnswer || 'Task complete with no explicit output content.',
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime
        });
      }
    }

    if (iteration >= agentConfig.maxIterations && shouldContinue) {
      steps.push({
        id: `step_${Date.now()}_max_iter`,
        type: 'error',
        title: 'Max Iterations Reached',
        content: `The agent halted because it reached the limit of ${agentConfig.maxIterations} reasoning loops.`,
        timestamp: new Date().toISOString()
      });
    }

    const totalTime = Date.now() - startTime;
    res.json({
      success: true,
      finalAnswer: finalAnswer || 'Task completed.',
      steps,
      executionTimeMs: totalTime,
      promptTokens,
      completionTokens
    } as AgentRunResponse);

  } catch (error: any) {
    console.error('Agent loop failed:', error);
    steps.push({
      id: `step_${Date.now()}_fail`,
      type: 'error',
      title: 'Agent Loop Error',
      content: `The agent encountered an error: ${error.message}\n\nPlease check your GROQ_API_KEY or connection.`,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      error: error.message,
      steps,
      executionTimeMs: Date.now() - startTime
    });
  }
});

// Configure Vite or Serve static site
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted (Development Mode)');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Static asset serving mounted (Production Mode)');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
