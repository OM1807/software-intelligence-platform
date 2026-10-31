import { useEffect, useState } from 'react';
import { Bot, Send, Sparkles, AlertCircle, ArrowUpRight, HelpCircle, RefreshCw } from 'lucide-react';
import { api, type AskAIResponse } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  timestamp: string;
};

const SUGGESTIONS = [
  'What are the most dangerous code hotspots in this repository?',
  'Explain any architectural layer violations detected and how to resolve them.',
  'Are there any circular dependencies in the codebase?',
  'What should be the top refactoring priorities for this release?',
  'Give me an executive health and maintainability summary.',
];

export default function AIAssistant() {
  const { activeRepo } = useRepos();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '👋 Welcome! I am your Software Intelligence Platform AI Assistant. Ask me anything about this repository’s code complexity, dependency graph, architectural drift, or change impact risks.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!activeRepo) return;
    api.getSystemConfig()
      .then((config) => setLlmConfigured(config.llm_configured))
      .catch((cause) => {
        setLlmConfigured(null);
        setError(cause instanceof Error ? cause.message : 'Unable to load AI provider status.');
      });
  }, [activeRepo]);

  async function handleSend(textToSend?: string) {
    const question = (textToSend || input).trim();
    if (!question || !activeRepo || loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const res: AskAIResponse = await api.askAI(activeRepo.id, question);
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: res.answer,
        provider: res.provider,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to retrieve AI explanation.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Ask AI Assistant"
        description="Query repository intelligence, explore architectural risks, and receive actionable code-review advice."
      />

      {!activeRepo && (
        <div className="card text-center py-10">
          <AlertCircle className="mx-auto text-amber-500 mb-2" size={32} />
          <p className="font-semibold text-slate-800">No Active Repository Selected</p>
          <p className="text-sm text-slate-500 mt-1">Please select an analyzed repository to start querying the AI assistant.</p>
        </div>
      )}

      {activeRepo && activeRepo.status !== 'completed' && (
        <div className="card bg-amber-50 border-amber-200 text-amber-800 mb-6">
          <p className="text-sm font-medium">Repository analysis is currently {activeRepo.status}.</p>
          <p className="text-xs mt-1 text-amber-700">The AI assistant requires complete repository metrics to provide accurate answers.</p>
        </div>
      )}

      {activeRepo && activeRepo.status === 'completed' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Chat Feed */}
          <div className="lg:col-span-3 flex flex-col h-[650px] card p-0 overflow-hidden shadow-sm">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="shrink-0 w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                      <Sparkles size={16} />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-none'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    <div className="mt-2 flex items-center justify-between text-[10px] opacity-70">
                      <span>{msg.timestamp}</span>
                      {msg.provider && (
                        <span className="font-semibold uppercase tracking-wider">
                          via {msg.provider === 'gemini' ? 'Gemini 2.0' : 'Local Heuristics Engine'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 justify-start items-center text-xs text-slate-500">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center animate-spin">
                    <RefreshCw size={15} />
                  </div>
                  <span>Analyzing repository intelligence and synthesizing explanation…</span>
                </div>
              )}

              {error && (
                <p className="p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
                  {error}
                </p>
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="border-t p-3 bg-white flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about architectural risks, cyclomatic complexity, circular dependencies…"
                disabled={loading}
                className="input flex-1"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="btn-primary gap-1.5 px-4"
              >
                <Send size={15} /> Send
              </button>
            </form>
          </div>

          {/* Prompt Suggestions & Context Panel */}
          <div className="space-y-4">
            <div className="card">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
                <HelpCircle size={15} className="text-blue-600" /> Suggested Queries
              </h3>
              <div className="space-y-2">
                {SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void handleSend(suggestion)}
                    disabled={loading}
                    className="w-full text-left text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/50 hover:border-blue-300 transition text-slate-700 flex items-start justify-between group"
                  >
                    <span>{suggestion}</span>
                    <ArrowUpRight size={13} className="shrink-0 text-slate-400 group-hover:text-blue-600 mt-0.5 ml-1" />
                  </button>
                ))}
              </div>
            </div>

            <div className="card bg-slate-900 text-white text-xs space-y-2">
              <p className="font-semibold text-blue-300 flex items-center gap-1.5">
                <Bot size={15} /> Intelligence Model
              </p>
              <p className="text-slate-300 leading-relaxed">
                {llmConfigured === false
                  ? 'Using the local deterministic intelligence engine. Add a Gemini key in System Configuration to enable live model responses.'
                  : 'Uses repository parsing, Git history, and dependency graph metrics to answer engineering queries.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
