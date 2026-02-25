import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Table as TableIcon, 
  AlertCircle, 
  Database,
  Search,
  Loader2,
  Copy,
  Trash2,
  ExternalLink,
  Settings,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { matchEpicNumbers, VoterRecord } from '@/src/services/geminiService';

// Manual Deployment URL as requested
const DEFAULT_GAS_DEPLOY_URL = "https://script.google.com/macros/s/AKfycbwxm2c7LJ_6QsfaZp6cMprvKpDvhqG0BzuQP7x7_9DXiCrpehKnjCZ_6zhn4JnLeiP6cA/exec"; 

const parseTableData = (text: string, type: 'loksabha' | 'vidhansabha'): VoterRecord[] => {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return [];

  return lines.map((line, index) => {
    const parts = line.split('\t').map(p => p.trim());
    if (type === 'loksabha') {
      return {
        id: `ls-${index}`,
        svnNo: parts[0] || '',
        houseNo: parts[1] || '',
        voterName: parts[2] || '',
        relativeName: parts[3] || '',
        epicNo: parts[4] || ''
      };
    } else {
      return {
        id: `vs-${index}`,
        epicNo: parts[0] || '',
        houseNo: parts[1] || '',
        voterName: parts[2] || '',
        relativeName: parts[3] || ''
      };
    }
  });
};

export default function App() {
  const [mode, setMode] = useState<'manual' | 'gas'>('manual');
  const [gasUrl, setGasUrl] = useState(DEFAULT_GAS_DEPLOY_URL);
  const [loksabhaInput, setLoksabhaInput] = useState('');
  const [vidhansabhaInput, setVidhansabhaInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<VoterRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gasStatus, setGasStatus] = useState<string | null>(null);

  const loksabhaData = useMemo(() => parseTableData(loksabhaInput, 'loksabha'), [loksabhaInput]);
  const vidhansabhaData = useMemo(() => parseTableData(vidhansabhaInput, 'vidhansabha'), [vidhansabhaInput]);

  const handleProcessManual = async () => {
    if (loksabhaData.length === 0 || vidhansabhaData.length === 0) {
      setError('Please provide data for both lists.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const matched = await matchEpicNumbers(loksabhaData, vidhansabhaData);
      setResults(matched);
    } catch (err) {
      setError('An error occurred during processing. Please try again.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessGAS = async () => {
    if (!gasUrl) {
      setError('Please provide your Google Apps Script Deployment URL.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setGasStatus('Connecting to Google Sheets...');

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors', // GAS Web Apps often require no-cors for simple triggers
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_and_match' })
      });
      
      // Since no-cors doesn't allow reading response, we assume success or instruct user
      setGasStatus('Request sent! Check your Google Sheet for updates.');
      setTimeout(() => setGasStatus(null), 5000);
    } catch (err) {
      setError('Failed to connect to Google Apps Script. Ensure the URL is correct and deployed as "Anyone".');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    if (!results) return;
    const header = "SVN क्रमांक\tमकान नं०\tनिर्वाचक का नाम\tपिता/पति/माता का नाम\tEPIC क्रमांक";
    const body = results.map(r => 
      `${r.svnNo}\t${r.houseNo}\t${r.voterName}\t${r.relativeName}\t${r.epicNo}`
    ).join('\n');
    navigator.clipboard.writeText(`${header}\n${body}`);
    alert('Copied to clipboard!');
  };

  return (
    <div className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-12 border-b border-[#141414] pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Database className="w-8 h-8" />
            <h1 className="text-4xl font-bold tracking-tighter uppercase">EPIC Matcher</h1>
          </div>
          <p className="text-sm opacity-60 font-mono">Voter List Reconciliation Utility v2.0</p>
        </div>

        <div className="flex bg-white/50 border border-[#141414] p-1 rounded-sm">
          <button 
            onClick={() => setMode('manual')}
            className={cn(
              "px-4 py-2 text-[10px] font-mono uppercase tracking-widest transition-all",
              mode === 'manual' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/10"
            )}
          >
            Manual Paste
          </button>
          <button 
            onClick={() => setMode('gas')}
            className={cn(
              "px-4 py-2 text-[10px] font-mono uppercase tracking-widest transition-all",
              mode === 'gas' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/10"
            )}
          >
            Google Sheets (GAS)
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {mode === 'manual' ? (
          <>
            {/* Manual Input Section */}
            <div className="space-y-8">
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif italic text-xl">01. Loksabha List</h2>
                  <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Target Dataset</span>
                </div>
                <textarea
                  className="w-full h-64 bg-white/50 border border-[#141414] p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#141414] transition-all"
                  placeholder="Paste Loksabha data here (Tab separated)..."
                  value={loksabhaInput}
                  onChange={(e) => setLoksabhaInput(e.target.value)}
                />
                <div className="mt-2 flex justify-between text-[10px] font-mono opacity-50">
                  <span>{loksabhaData.length} Records Detected</span>
                  <button onClick={() => setLoksabhaInput('')} className="hover:underline flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif italic text-xl">02. Vidhansabha List</h2>
                  <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Reference Dataset</span>
                </div>
                <textarea
                  className="w-full h-64 bg-white/50 border border-[#141414] p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#141414] transition-all"
                  placeholder="Paste Vidhansabha data here (Tab separated)..."
                  value={vidhansabhaInput}
                  onChange={(e) => setVidhansabhaInput(e.target.value)}
                />
                <div className="mt-2 flex justify-between text-[10px] font-mono opacity-50">
                  <span>{vidhansabhaData.length} Records Detected</span>
                  <button onClick={() => setVidhansabhaInput('')} className="hover:underline flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                </div>
              </section>

              <button
                onClick={handleProcessManual}
                disabled={isProcessing || !loksabhaInput || !vidhansabhaInput}
                className={cn(
                  "w-full py-4 bg-[#141414] text-[#E4E3E0] font-bold uppercase tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed",
                  isProcessing && "animate-pulse"
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing with AI...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Start Reconciliation
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* GAS Section */
          <div className="space-y-8">
            <section className="bg-white/50 border border-[#141414] p-8">
              <div className="flex items-center gap-3 mb-6">
                <Settings className="w-6 h-6" />
                <h2 className="font-serif italic text-2xl">GAS Configuration</h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">Deployment URL</label>
                  <input 
                    type="text"
                    value={gasUrl}
                    onChange={(e) => setGasUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full bg-white border border-[#141414] p-3 font-mono text-xs focus:outline-none"
                  />
                </div>

                <div className="p-4 bg-[#141414]/5 border border-[#141414]/20 space-y-3">
                  <p className="text-xs font-medium">Setup Instructions:</p>
                  <ol className="text-[11px] space-y-2 list-decimal ml-4 opacity-70">
                    <li>Open your Google Sheet with "loksabha" and "vidhansabha" sheets.</li>
                    <li>Go to <strong>Extensions &gt; Apps Script</strong>.</li>
                    <li>Copy the code from <code>code.js</code> in this project.</li>
                    <li>Deploy as <strong>Web App</strong> (Execute as: Me, Access: Anyone).</li>
                    <li>Paste the URL above and click Sync.</li>
                  </ol>
                </div>

                <button
                  onClick={handleProcessGAS}
                  disabled={isProcessing || !gasUrl}
                  className={cn(
                    "w-full py-4 bg-[#141414] text-[#E4E3E0] font-bold uppercase tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Syncing Sheets...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      Sync & Match Sheets
                    </>
                  )}
                </button>

                {gasStatus && (
                  <div className="p-4 bg-emerald-50 border border-emerald-400 text-emerald-700 flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    {gasStatus}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Results Section */}
        <div className="relative">
          <div className="sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif italic text-xl">03. Output Preview</h2>
              {results && (
                <div className="flex gap-2">
                  <button 
                    onClick={copyToClipboard}
                    className="text-[10px] font-mono uppercase tracking-widest border border-[#141414] px-3 py-1 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Copy Result
                  </button>
                </div>
              )}
            </div>

            <div className="border border-[#141414] bg-white/30 h-[calc(100vh-250px)] overflow-auto">
              {!results && !isProcessing && (
                <div className="h-full flex flex-col items-center justify-center opacity-30 p-12 text-center">
                  <TableIcon className="w-12 h-12 mb-4" />
                  <p className="font-mono text-sm">
                    {mode === 'manual' 
                      ? "Results will appear here after processing." 
                      : "GAS mode updates your Google Sheet directly."}
                  </p>
                </div>
              )}

              {isProcessing && (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                  <Loader2 className="w-12 h-12 mb-4 animate-spin" />
                  <p className="font-serif italic text-xl mb-2">Analyzing Voter Records</p>
                  <p className="font-mono text-xs opacity-50">Using Gemini AI to resolve name variations and house numbers...</p>
                </div>
              )}

              {results && (
                <div className="min-w-[600px]">
                  <div className="grid grid-cols-[60px_80px_1fr_1fr_120px] p-4 data-grid-header sticky top-0 bg-[#E4E3E0] z-10">
                    <div>SVN</div>
                    <div>House</div>
                    <div>Name</div>
                    <div>Relative</div>
                    <div>EPIC No</div>
                  </div>
                  {results.map((record) => (
                    <div key={record.id} className="grid grid-cols-[60px_80px_1fr_1fr_120px] px-4 py-2 text-xs font-mono border-b border-[#141414]/10 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors group">
                      <div className="opacity-50 group-hover:opacity-100">{record.svnNo}</div>
                      <div>{record.houseNo}</div>
                      <div className="font-sans font-medium">{record.voterName}</div>
                      <div className="font-sans opacity-70 group-hover:opacity-100">{record.relativeName}</div>
                      <div className={cn(
                        "font-bold",
                        record.epicNo ? "text-emerald-700 group-hover:text-emerald-300" : "text-red-400 opacity-50"
                      )}>
                        {record.epicNo || 'NOT FOUND'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-24 pt-8 border-t border-[#141414] flex justify-between items-end">
        <div>
          <p className="text-[10px] font-mono opacity-50 uppercase tracking-[0.2em]">System Status</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono">AI Engine Ready</span>
          </div>
        </div>
        <p className="text-[10px] font-mono opacity-30">© 2026 Voter Reconciliation Systems</p>
      </footer>
    </div>
  );
}
