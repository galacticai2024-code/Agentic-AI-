/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Database, 
  Settings, 
  Activity, 
  Terminal, 
  Search, 
  Calculator, 
  CloudSun, 
  Clock, 
  Trash2, 
  Copy, 
  Check, 
  RotateCcw, 
  Info, 
  Brain, 
  ChevronRight, 
  ChevronDown, 
  Cpu, 
  Layers, 
  Compass, 
  HelpCircle,
  RefreshCw,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AgentConfig, AgentStep, MemoryItem, AgentRunResponse } from './types.js';

const PRESET_PROMPTS = [
  {
    id: 'p1',
    title: 'Multi-Step Search & Calc',
    icon: Search,
    description: 'Retrieve population of Tokyo, perform calculation, and save result.',
    prompt: 'Search Wikipedia for information about IBM and provide some unique facts.'
  },
  {
    id: 'p2',
    title: 'Weather Comparison Summary',
    icon: CloudSun,
    description: 'Compare current weather of two capital cities and save summary.',
    prompt: 'Get the current weather details for London and Paris. Compare their temperatures, determine which one is warmer, and save a brief comparison text as "weather_comparison".'
  },
  {
    id: 'p3',
    title: 'Retrieve Memory & Write Email',
    icon: Database,
    description: 'Retrieve a stored project status and draft a formal update email.',
    prompt: 'Search the database memory for the key "project_status", then compose a brief, professional email draft incorporating that status information.'
  },
  {
    id: 'p4',
    title: 'Autonomous Equation Solver',
    icon: Calculator,
    description: 'Evaluate complex algebraic expression step-by-step.',
    prompt: 'Calculate the mathematical value of: (145 * 32) + (1024 / 4) ^ 2. Tell me the step-by-step math evaluation.'
  }
];

const AVAILABLE_TOOLS = [
  { id: 'web_search', name: 'Web Search', icon: Search, desc: 'Wikipedia query search tool', cat: 'search' },
  { id: 'calculator', name: 'Calculator', icon: Calculator, desc: 'Safe math expression solver', cat: 'utility' },
  { id: 'get_weather', name: 'Weather API', icon: CloudSun, desc: 'Live Open-Meteo current forecast', cat: 'weather' },
  { id: 'database_store', name: 'Memory Save', icon: Database, desc: 'Saves notes to the in-memory store', cat: 'database' },
  { id: 'database_search', name: 'Memory Search', icon: Database, desc: 'Queries stored agent database', cat: 'database' },
  { id: 'get_current_time', name: 'System Clock', icon: Clock, desc: 'Fetch local and UTC system time', cat: 'utility' }
];

export default function App() {
  // Input and Configuration
  const [prompt, setPrompt] = useState(PRESET_PROMPTS[0].prompt);
  const [model, setModel] = useState('llama-3.1-8b-instant');
  const [systemPrompt, setSystemPrompt] = useState('You are a highly efficient task automation agent. Use tools strategically to answer queries step-by-step. Break queries down, evaluate facts, and always keep answers concise.');
  const [temperature, setTemperature] = useState(0.2);
  const [maxIterations, setMaxIterations] = useState(5);
  const [enabledTools, setEnabledTools] = useState<string[]>(['web_search', 'calculator', 'get_weather', 'database_store', 'database_search', 'get_current_time']);

  // UI State
  const [activeTab, setActiveTab] = useState<'trace' | 'memory'>('trace');
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);

  // Execution Results
  const [isRunning, setIsRunning] = useState(false);
  const [runDuration, setRunDuration] = useState(0);
  const [finalAnswer, setFinalAnswer] = useState<string>('');
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [metrics, setMetrics] = useState<{
    promptTokens: number;
    completionTokens: number;
    executionTimeMs: number;
  } | null>(null);

  // Memories
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [searchMemoryQuery, setSearchMemoryQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // References
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const traceEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch agent memory store
  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      if (data && data.memories) {
        setMemories(data.memories);
      }
    } catch (err) {
      console.error('Error fetching memories:', err);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  // Delete database item
  const deleteMemory = async (id: string) => {
    try {
      const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchMemories();
      }
    } catch (err) {
      console.error('Error deleting memory:', err);
    }
  };

  // Run Agent
  const handleRunAgent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isRunning) return;

    setIsRunning(true);
    setFinalAnswer('');
    setSteps([]);
    setErrorMsg('');
    setMetrics(null);
    setRunDuration(0);
    setActiveTab('trace');

    // Start timer count
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setRunDuration(Math.floor((Date.now() - startTime) / 100) / 10);
    }, 100);

    const config: AgentConfig = {
      model,
      systemPrompt,
      temperature,
      maxIterations,
      enabledTools
    };

    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt, config })
      });

      const result = await response.json();

      if (timerRef.current) clearInterval(timerRef.current);

      if (result.success) {
        setFinalAnswer(result.finalAnswer);
        setSteps(result.steps);
        setMetrics({
          promptTokens: result.promptTokens || 0,
          completionTokens: result.completionTokens || 0,
          executionTimeMs: result.executionTimeMs || 0
        });
        
        // Auto-expand tool results and final answer
        const newExpanded: Record<string, boolean> = {};
        result.steps.forEach((s: AgentStep) => {
          if (s.type === 'tool_call' || s.type === 'observation' || s.type === 'final_answer' || s.type === 'error') {
            newExpanded[s.id] = true;
          }
        });
        setExpandedSteps(newExpanded);
        
        // Refresh Memory List in case agent saved new memories
        await fetchMemories();
      } else {
        setErrorMsg(result.error || 'Agent execution failed');
        if (result.steps) {
          setSteps(result.steps);
        }
      }
    } catch (err: any) {
      if (timerRef.current) clearInterval(timerRef.current);
      setErrorMsg(err.message || 'Network error executing agent.');
    } finally {
      setIsRunning(false);
    }
  };

  // Auto-scroll trace timeline to bottom as steps load
  useEffect(() => {
    if (isRunning && traceEndRef.current) {
      traceEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [steps, isRunning]);

  // Copy output to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(finalAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Toggle tool selection
  const handleToggleTool = (toolId: string) => {
    if (enabledTools.includes(toolId)) {
      setEnabledTools(enabledTools.filter(t => t !== toolId));
    } else {
      setEnabledTools([...enabledTools, toolId]);
    }
  };

  // Filter memories
  const filteredMemories = memories.filter(m => 
    m.key.toLowerCase().includes(searchMemoryQuery.toLowerCase()) ||
    m.value.toLowerCase().includes(searchMemoryQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 selection:bg-indigo-100 selection:text-indigo-900" id="app_root">
      {/* Top Banner / Header */}
      <header className="border-b border-slate-200 bg-white shadow-xs sticky top-0 z-10 px-6 py-4" id="app_header">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 animate-pulse">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-display text-slate-900 tracking-tight">AI Agent Studio</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-emerald-500 inline-block animate-ping"></span> Live
                </span>
              </div>
              <p className="text-xs text-slate-500">Groq-powered multi-tool LangChain Orchestrator Workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono hidden md:inline">Server Target: Port 3000</span>
            <button 
              onClick={fetchMemories} 
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors border border-slate-200 bg-white flex items-center gap-1.5 text-xs font-medium"
              title="Refresh DB memories"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sync DB</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6" id="app_main">
        
        {/* Left Column: Workspace Configurator (4 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6" id="workspace_config">
          
          {/* Quick Scenario Preset Prompts */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="h-4.5 w-4.5 text-indigo-600" />
                <h2 className="text-sm font-semibold text-slate-900 font-display">Scenario Presets</h2>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">ReAct Patterns</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {PRESET_PROMPTS.map((preset) => {
                const IconComp = preset.icon;
                const isSelected = prompt === preset.prompt;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setPrompt(preset.prompt)}
                    className={`text-left p-3 rounded-xl transition-all border ${
                      isSelected 
                        ? 'bg-indigo-50/50 border-indigo-200 ring-2 ring-indigo-500/10' 
                        : 'bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`p-1.5 rounded-lg ${isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-500 border border-slate-200'}`}>
                        <IconComp className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 flex items-center justify-between">
                          <span>{preset.title}</span>
                          {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{preset.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Active Prompt Launcher Panel */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-indigo-600 animate-spin" style={{ animationDuration: '3s' }} />
              <h2 className="text-sm font-semibold text-slate-900 font-display">Agent Goal Prompt</h2>
            </div>

            <form onSubmit={handleRunAgent} className="flex flex-col gap-3">
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask the AI agent to do something using weather, search, math, or storing/retrieving notes..."
                  rows={4}
                  className="w-full text-sm p-4 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-hidden transition-all bg-slate-50/20 placeholder:text-slate-400 font-sans resize-none"
                  required
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPrompt('')}
                    className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Clear prompt"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isRunning || !prompt.trim()}
                className={`w-full py-3 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2.5 shadow-md transition-all ${
                  isRunning 
                    ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100 hover:shadow-indigo-200 active:scale-[0.99]'
                }`}
              >
                {isRunning ? (
                  <>
                    <Activity className="h-4 w-4 animate-spin text-indigo-600" />
                    <span>Executing reasoning loop... ({runDuration}s)</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>Orchestrate Agent Task</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Configuration Settings (Collapsible setting drawers) */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4.5 w-4.5 text-slate-600" />
                <h2 className="text-sm font-semibold text-slate-900 font-display">Orchestrator Settings</h2>
              </div>
              <Cpu className="h-4 w-4 text-slate-400" />
            </div>

            {/* Model Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Groq LLM Engine</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium focus:border-indigo-500 outline-hidden"
              >
                <option value="llama-3.1-8b-instant">Llama 3.1 8B (Instant / Fastest)</option>
                <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Versatile / Smartest)</option>
                <option value="mixtral-8x7b-32768">Mixtral 8x7B (Great formatting)</option>
              </select>
            </div>

            {/* Core Params */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Temperature</label>
                  <span className="text-[11px] font-mono text-indigo-600 font-bold">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5 bg-slate-100 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Max Iterations</label>
                  <span className="text-[11px] font-mono text-indigo-600 font-bold">{maxIterations} loops</span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(parseInt(e.target.value) || 5)}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 font-semibold focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Tools Toggles */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Agent Tool permissions</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {AVAILABLE_TOOLS.map((tool) => {
                  const ToolIcon = tool.icon;
                  const isEnabled = enabledTools.includes(tool.id);
                  return (
                    <button
                      type="button"
                      key={tool.id}
                      onClick={() => handleToggleTool(tool.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                        isEnabled 
                          ? 'bg-slate-50 border-slate-300 text-slate-800' 
                          : 'bg-white/50 border-slate-100 text-slate-400 line-through decoration-slate-200'
                      }`}
                    >
                      <span className={`p-1 rounded-md ${isEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                        <ToolIcon className="h-3.5 w-3.5" />
                      </span>
                      <div className="truncate">
                        <div className="text-[11px] font-semibold truncate">{tool.name}</div>
                        <div className="text-[8px] text-slate-400 truncate">{tool.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* System Prompt (System Instructions) */}
            <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">System Agent Prompt</label>
                <button 
                  type="button"
                  onClick={() => setSystemPrompt('You are a highly efficient task automation agent. Use tools strategically to answer queries step-by-step. Break queries down, evaluate facts, and always keep answers concise.')}
                  className="text-[10px] text-indigo-600 hover:underline font-medium"
                >
                  Reset Default
                </button>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:border-indigo-500 outline-hidden font-mono"
              />
            </div>
          </section>
        </div>

        {/* Right Column: Multi-tab Execution Inspector & Memories (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6" id="execution_inspector">
          
          {/* Metrics Dashboard Row */}
          {metrics && (
            <motion.section 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-3 gap-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs"
            >
              <div className="text-center border-r border-slate-100 py-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Execution Time</p>
                <p className="text-base font-bold font-mono text-slate-800 mt-0.5">{(metrics.executionTimeMs / 1000).toFixed(2)}s</p>
              </div>
              <div className="text-center border-r border-slate-100 py-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Prompt Tokens</p>
                <p className="text-base font-bold font-mono text-slate-800 mt-0.5">{metrics.promptTokens}</p>
              </div>
              <div className="text-center py-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Response Tokens</p>
                <p className="text-base font-bold font-mono text-indigo-600 mt-0.5">{metrics.completionTokens}</p>
              </div>
            </motion.section>
          )}

          {/* Interactive Inspection Workspace Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex-1 flex flex-col min-h-[500px]">
            
            {/* Tab Navigation */}
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('trace')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
                    activeTab === 'trace'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Agent Reasoning Trace</span>
                  {steps.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeTab === 'trace' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-600'}`}>
                      {steps.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setActiveTab('memory');
                    fetchMemories();
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
                    activeTab === 'memory'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>Agent DB Memory</span>
                  {memories.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeTab === 'memory' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-600'}`}>
                      {memories.length}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300"></span>
                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">Inspector</span>
              </div>
            </div>

            {/* Tab Panels */}
            <div className="p-6 flex-1 flex flex-col">
              
              {/* TAB PANEL 1: REASONING TRACE */}
              {activeTab === 'trace' && (
                <div className="flex-1 flex flex-col gap-6">
                  {steps.length === 0 && !isRunning && !errorMsg && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <div className="h-12 w-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                        <Terminal className="h-6 w-6" />
                      </div>
                      <h3 className="text-xs font-semibold text-slate-800">No active execution</h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">Configure your tools and select a preset scenario prompt on the left, then click "Orchestrate Agent Task" to trigger the agent reasoning loop.</p>
                    </div>
                  )}

                  {errorMsg && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 font-bold">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
                        <span>Execution Halted Error</span>
                      </div>
                      <p className="font-mono">{errorMsg}</p>
                      <p className="text-[11px] text-red-500 mt-1">💡 Tips: Double check that your GROQ_API_KEY is correct in the `.env` file, or that your custom network is active.</p>
                    </div>
                  )}

                  {/* Steps Timeline */}
                  {(steps.length > 0 || isRunning) && (
                    <div className="flex-1 flex flex-col">
                      <div className="space-y-4">
                        <AnimatePresence>
                          {steps.map((step, idx) => {
                            const isExpanded = !!expandedSteps[step.id];
                            
                            // Styling details per step type
                            let badgeBg = 'bg-slate-100 text-slate-700 border-slate-200';
                            let borderAccent = 'border-l-slate-300';
                            let StepIcon = Terminal;

                            if (step.type === 'thought') {
                              badgeBg = 'bg-amber-50 text-amber-800 border-amber-200';
                              borderAccent = 'border-l-amber-500';
                              StepIcon = Brain;
                            } else if (step.type === 'tool_call') {
                              badgeBg = 'bg-blue-50 text-blue-800 border-blue-200';
                              borderAccent = 'border-l-blue-500';
                              StepIcon = Cpu;
                            } else if (step.type === 'observation') {
                              badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                              borderAccent = 'border-l-emerald-500';
                              StepIcon = Database;
                            } else if (step.type === 'final_answer') {
                              badgeBg = 'bg-indigo-50 text-indigo-800 border-indigo-200';
                              borderAccent = 'border-l-indigo-600';
                              StepIcon = Sparkles;
                            } else if (step.type === 'error') {
                              badgeBg = 'bg-rose-50 text-rose-800 border-rose-200';
                              borderAccent = 'border-l-rose-500';
                              StepIcon = Info;
                            }

                            return (
                              <motion.div
                                key={step.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, delay: idx * 0.05 }}
                                className={`border border-slate-200 border-l-4 ${borderAccent} rounded-xl bg-white shadow-xs overflow-hidden`}
                              >
                                {/* Step Header Accordion Trigger */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedSteps({
                                    ...expandedSteps,
                                    [step.id]: !isExpanded
                                  })}
                                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className={`p-1.5 rounded-lg border text-xs ${badgeBg}`}>
                                      <StepIcon className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="truncate">
                                      <h4 className="text-xs font-semibold text-slate-900 truncate">{step.title}</h4>
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        {new Date(step.timestamp).toLocaleTimeString()} {step.durationMs ? `• ${step.durationMs}ms` : ''}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono tracking-wide scale-90">
                                      {step.type}
                                    </span>
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-slate-400" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-slate-400" />
                                    )}
                                  </div>
                                </button>

                                {/* Step Expandable Content */}
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="border-t border-slate-100 bg-slate-50/50 p-4"
                                    >
                                      {step.type === 'thought' ? (
                                        <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans bg-white p-3 rounded-lg border border-slate-100">
                                          {step.content}
                                        </p>
                                      ) : step.type === 'observation' || step.type === 'tool_call' ? (
                                        <pre className="text-[11px] font-mono text-slate-600 bg-slate-900 text-slate-200 p-3 rounded-lg overflow-x-auto border border-slate-800 leading-normal shadow-inner max-h-[250px]">
                                          <code>{step.content}</code>
                                        </pre>
                                      ) : (
                                        <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-white p-3 rounded-lg border border-slate-100">
                                          {step.content}
                                        </p>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>

                        {/* Spinner loading step */}
                        {isRunning && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center justify-center p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/20 text-slate-500 gap-3"
                          >
                            <Activity className="h-4 w-4 animate-spin text-indigo-600" />
                            <span className="text-xs font-medium font-mono">Agent executing next chain cycle... ({runDuration}s)</span>
                          </motion.div>
                        )}
                      </div>

                      <div ref={traceEndRef} className="h-2" />

                      {/* Display Final Consolidated Answer */}
                      {finalAnswer && !isRunning && (
                        <motion.div 
                          initial={{ scale: 0.98, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.4, delay: 0.2 }}
                          className="mt-6 border-2 border-indigo-100 bg-indigo-50/30 rounded-2xl p-5 shadow-xs flex flex-col gap-3"
                        >
                          <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="p-1.5 rounded-lg bg-indigo-600 text-white">
                                <Sparkles className="h-3.5 w-3.5" />
                              </span>
                              <h3 className="text-xs font-bold text-indigo-900 tracking-tight font-display uppercase">Agent Final Answer</h3>
                            </div>
                            <button
                              type="button"
                              onClick={copyToClipboard}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 bg-white border border-indigo-100 px-2.5 py-1 rounded-lg shadow-2xs hover:shadow-xs active:scale-95 transition-all"
                            >
                              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                              <span>{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          
                          <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap p-1">
                            {finalAnswer}
                          </p>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB PANEL 2: DATABASE MEMORIES */}
              {activeTab === 'memory' && (
                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search cached agent memories..."
                        value={searchMemoryQuery}
                        onChange={(e) => setSearchMemoryQuery(e.target.value)}
                        className="w-full text-xs pl-9 pr-4 py-2 bg-white rounded-lg border border-slate-200 focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono bg-white border border-slate-100 px-2 py-1 rounded-lg font-bold">
                      {memories.length} Key-Value pairs
                    </span>
                  </div>

                  {filteredMemories.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/30">
                      <Database className="h-10 w-10 text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-800">No memories found</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">
                        {searchMemoryQuery ? 'No memories matched your search criteria.' : 'The agent database memory is empty. Use database_store in the prompt to allow the agent to remember facts!'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-x-auto">
                      <table className="w-full text-xs text-left text-slate-600">
                        <thead className="text-[10px] uppercase text-slate-400 bg-slate-50/50 border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-3 font-bold font-mono">Key Name</th>
                            <th className="px-4 py-3 font-bold font-mono">Saved Value</th>
                            <th className="px-4 py-3 font-bold font-mono">Saved Timestamp</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredMemories.map((mem) => (
                            <tr key={mem.id} className="hover:bg-slate-50/30 transition-colors">
                              <td className="px-4 py-3.5 font-bold font-mono text-slate-800">{mem.key}</td>
                              <td className="px-4 py-3.5 max-w-[220px] truncate" title={mem.value}>{mem.value}</td>
                              <td className="px-4 py-3.5 text-slate-400 font-mono text-[10px]">{new Date(mem.createdAt).toLocaleString()}</td>
                              <td className="px-4 py-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => deleteMemory(mem.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                  title="Remove memory"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-[11px] text-slate-500 leading-relaxed flex items-start gap-2.5">
                    <Info className="h-4.5 w-4.5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-700">How the Agent Memory works:</p>
                      <p className="mt-0.5">When you ask the agent to "remember", "save", or "store" some information, it invokes the **database_store** tool. This saves a key-value pair to this Express server database. In subsequent queries, asking the agent to "lookup", "retrieve", or "search notes" triggers **database_search** to retrieve these values! Try it by asking: *"What is stored under key project_status?"*</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Workspace Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 px-6 text-center text-xs text-slate-400 mt-auto" id="app_footer">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p>© 2026 AI Agent Studio. Created for advanced task automation prototyping using React, Express, and Groq.</p>
          <div className="flex gap-4 justify-center">
            <a href="https://groq.com/" target="_blank" rel="noreferrer" className="hover:text-indigo-600 transition-colors font-medium">Groq Engine</a>
            <span>•</span>
            <a href="https://js.langchain.com/" target="_blank" rel="noreferrer" className="hover:text-indigo-600 transition-colors font-medium">LangChain Concepts</a>
            <span>•</span>
            <a href="https://render.com" target="_blank" rel="noreferrer" className="hover:text-indigo-600 transition-colors font-medium">Deploy to Render</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
