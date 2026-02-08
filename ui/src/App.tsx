import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
  Code2,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  Download,
  Trash2,
  Settings,
  Activity,
  Box
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BASE_URL = 'http://localhost:3001';

interface Model {
  name: string;
}

const DEFAULT_JAVA_CODE = `// Paste your Selenium Java code here
import org.openqa.selenium.WebDriver;

public class Test {
    @Test
    public void login() {
        driver.findElement(By.id("user")).sendKeys("admin");
        driver.findElement(By.id("pass")).sendKeys("1234");
        driver.findElement(By.id("login")).click();
    }
}`;

function App() {
  const [inputCode, setInputCode] = useState<string>(DEFAULT_JAVA_CODE);
  const [outputCode, setOutputCode] = useState<string>('// Playwright code will appear here...');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('llama3.2:latest');
  const [systemStatus, setSystemStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');

  const outputRef = useRef<string>('');

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      setSystemStatus(res.ok ? 'online' : 'offline');
    } catch {
      setSystemStatus('offline');
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/models`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setModels(data);
        if (data.length > 0 && !data.find(m => m.name === selectedModel)) {
          setSelectedModel(data[0].name);
        }
      }
    } catch (e) {
      console.error('Failed to fetch models', e);
    }
  }, [selectedModel]);

  useEffect(() => {
    fetchModels();
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchModels, checkStatus]);

  const handleConvert = useCallback(async () => {
    if (!inputCode.trim()) return;

    setIsLoading(true);
    setOutputCode('');
    outputRef.current = '';

    try {
      const response = await fetch(`${BASE_URL}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputCode, model: selectedModel, stream: true })
      });

      if (!response.body) throw new Error('No readable stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) {
              outputRef.current += data.chunk;
              setOutputCode(outputRef.current);
            }
            if (data.error) {
              setOutputCode(prev => prev + '\n// Error: ' + data.error);
            }
          } catch (e) {
            // Wait for more data if JSON is partial
          }
        }
      }
    } catch (e: any) {
      setOutputCode('// Error: ' + (e.message || 'Connection Error: Is the backend running?'));
    } finally {
      setIsLoading(false);
    }
  }, [inputCode, selectedModel]);

  const copyToClipboard = useCallback(() => {
    if (!outputCode) return;
    navigator.clipboard.writeText(outputCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [outputCode]);

  const downloadCode = useCallback(() => {
    if (!outputCode) return;
    const blob = new Blob([outputCode], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted-playwright.test.ts';
    a.click();
    URL.revokeObjectURL(url);
  }, [outputCode]);

  const editorOptions = useMemo(() => ({
    minimap: { enabled: false },
    fontSize: 14,
    padding: { top: 16 },
    lineNumbersMinChars: 3,
    fontFamily: "'JetBrains Mono', monospace",
    smoothScrolling: true,
    cursorBlinking: "expand" as const,
    renderLineHighlight: "all" as const,
    scrollBeyondLastLine: false,
    automaticLayout: true,
  }), []);

  return (
    <div className="h-screen flex flex-col p-4 gap-4 bg-[#0a0a0c] text-[#ececf1] overflow-hidden">
      {/* Background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/10 blur-[120px] rounded-full"></div>
      </div>

      <header className="glass-panel p-4 rounded-2xl flex items-center justify-between shrink-0 z-10 transition-all">
        <div className="flex items-center gap-4">
          <motion.div
            whileHover={{ rotate: 10, scale: 1.05 }}
            className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-lg ring-1 ring-white/20"
          >
            <Code2 className="text-white w-7 h-7" />
          </motion.div>
          <div>
            <h1 className="text-2xl font-black tracking-tight gradient-text">Selenium → Playwright</h1>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full transition-colors ${systemStatus === 'online' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`} />
              <p className="text-xs font-semibold text-gray-400 capitalize">Status: {systemStatus}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold px-1">Model Selection</label>
            <div className="relative group">
              <Box className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 pointer-events-none" />
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-white/5 border border-white/10 text-sm rounded-lg pl-9 pr-10 py-2.5 appearance-none hover:bg-white/10 focus:ring-2 focus:ring-purple-500/40 outline-none transition-all cursor-pointer min-w-[180px]"
              >
                {models.length > 0 ? (
                  models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)
                ) : (
                  <option value="llama3.2:latest">llama3.2:latest</option>
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleConvert}
            disabled={isLoading || systemStatus !== 'online'}
            className="btn-primary group relative flex items-center justify-center gap-2 px-8 h-12 min-w-[140px]"
          >
            {isLoading ? (
              <Activity className="w-5 h-5 animate-pulse text-white/70" />
            ) : (
              <Sparkles className="w-5 h-5 text-indigo-200 group-hover:animate-pulse" />
            )}
            <span className="font-bold uppercase tracking-widest text-sm">
              {isLoading ? 'Processing' : 'Convertor'}
            </span>
          </motion.button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-2 gap-4 min-h-0 z-10">
        {/* Left Side: Input */}
        <section className="glass-panel rounded-2xl flex flex-col overflow-hidden border border-white/5">
          <div className="p-3 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="bg-orange-500/10 text-orange-400 px-2 py-1 rounded inline-flex items-center text-[10px] font-bold ring-1 ring-orange-500/20">JAVA</span>
              <span className="text-sm font-bold text-gray-400 uppercase tracking-tighter">Selenium Source</span>
            </div>
            <button
              onClick={() => setInputCode('')}
              className="p-2 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
              title="Clear all source code"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              language="java"
              theme="vs-dark"
              value={inputCode}
              onChange={(val) => setInputCode(val || '')}
              options={editorOptions}
            />
          </div>
        </section>

        {/* Right Side: Output */}
        <section className="glass-panel rounded-2xl flex flex-col overflow-hidden border border-white/5 relative">
          <div className="p-3 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded inline-flex items-center text-[10px] font-bold ring-1 ring-blue-500/20">TYPESCRIPT</span>
              <span className="text-sm font-bold text-gray-400 uppercase tracking-tighter">Playwright Output</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={downloadCode}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                title="Download as .ts file"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={copyToClipboard}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex-1 relative">
            <AnimatePresence>
              {isLoading && !outputCode && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 bg-[#0a0a0c]/80 backdrop-blur-sm flex items-center justify-center"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative flex items-center justify-center">
                      <div className="absolute w-20 h-20 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                      <Sparkles className="w-8 h-8 text-indigo-400 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white tracking-tight">AI Optimizing Code</p>
                      <p className="text-sm text-gray-500">Generating type-safe Playwright tests...</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <Editor
              height="100%"
              language="typescript"
              theme="vs-dark"
              value={outputCode}
              options={{ ...editorOptions, readOnly: true }}
            />
          </div>
        </section>
      </main>

      <footer className="glass-panel py-2.5 px-6 rounded-xl flex justify-between items-center shrink-0 z-10 border border-white/5">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 group cursor-default">
            <Activity className="w-3.5 h-3.5 text-indigo-500/60" />
            <span className="text-[11px] font-mono text-gray-500">ENGINE: OLLAMA 3.2</span>
          </div>
          <div className="flex items-center gap-2 group cursor-default">
            <Settings className="w-3.5 h-3.5 text-purple-500/60" />
            <span className="text-[11px] font-mono text-gray-500">STREAMING: ACTIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-1 w-24 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-indigo-500"
              animate={{ x: isLoading ? ["-100%", "100%"] : 0 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            />
          </div>
          <span className="text-[10px] text-gray-600 font-black uppercase tracking-[0.2em]">Edge AI Converter</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
