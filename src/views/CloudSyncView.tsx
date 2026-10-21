// ============================================================================
// PROBAHO ERP: FIREBASE CLOUD SYNCHRONIZATION VIEW
// File: src/views/CloudSyncView.tsx
// Features: Multi-Device Team Collaboration, Firestore Sync, Cloud Backup
// ============================================================================

import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  CloudRain, 
  CloudLightning, 
  UploadCloud, 
  DownloadCloud, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Key, 
  Layers, 
  RefreshCw, 
  ExternalLink,
  Users,
  Copy,
  Check,
  Building,
  Radio
} from 'lucide-react';
import { firebaseSync, type SyncStatus, type FirebaseConfig } from '../services/firebaseSync';

interface CloudSyncViewProps {
  onRefreshAll?: () => void;
}

export const CloudSyncView: React.FC<CloudSyncViewProps> = ({ onRefreshAll }) => {
  const [status, setStatus] = useState<SyncStatus>(() => firebaseSync.getStatus());
  const [activeConfig, setActiveConfig] = useState<FirebaseConfig | null>(() => firebaseSync.getActiveConfig());
  const [workspaceId, setWorkspaceId] = useState<string>(() => firebaseSync.getActiveWorkspaceId());

  // Input field state
  const [configInput, setConfigInput] = useState<string>('');
  const [workspaceInput, setWorkspaceInput] = useState<string>(() => firebaseSync.getActiveWorkspaceId());
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [copiedSample, setCopiedSample] = useState<boolean>(false);

  useEffect(() => {
    const unsub = firebaseSync.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setActiveConfig(firebaseSync.getActiveConfig());
      setWorkspaceId(firebaseSync.getActiveWorkspaceId());
    });
    return unsub;
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const parsed = firebaseSync.parseFirebaseConfigInput(configInput);
    if (!parsed) {
      setStatusMessage({
        type: 'error',
        text: 'Invalid Firebase configuration. Please paste valid JSON or the standard firebaseConfig JavaScript snippet.'
      });
      return;
    }

    const cleanWorkspace = workspaceInput.trim().toUpperCase() || 'PROBAHO-WORKSPACE';
    setIsConnecting(true);

    try {
      const res = await firebaseSync.connectWithConfig(parsed, cleanWorkspace);
      if (res.success) {
        setStatusMessage({ type: 'success', text: res.message });
        setConfigInput('');
      } else {
        setStatusMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Connection failed.' });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (confirm('Disconnect from Firebase Cloud? Local data will remain intact in offline SQLite.')) {
      firebaseSync.disconnect();
      setStatusMessage({ type: 'info', text: 'Disconnected from Firebase Cloud.' });
    }
  };

  const handlePushData = async () => {
    setIsPushing(true);
    setStatusMessage(null);
    try {
      const res = await firebaseSync.pushLocalDataToCloud('Master Admin');
      if (res.success) {
        setStatusMessage({ type: 'success', text: res.message });
      } else {
        setStatusMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to push data.' });
    } finally {
      setIsPushing(false);
    }
  };

  const handlePullData = async () => {
    if (!confirm('Synchronize from Cloud? This will update local items, stock, warehouses, and staff accounts with the cloud database.')) {
      return;
    }
    setIsPulling(true);
    setStatusMessage(null);
    try {
      const res = await firebaseSync.pullCloudDataToLocal(workspaceId);
      if (res.success) {
        setStatusMessage({ type: 'success', text: res.message });
        if (onRefreshAll) onRefreshAll();
      } else {
        setStatusMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to pull cloud data.' });
    } finally {
      setIsPulling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/60 p-5 rounded-2xl border border-slate-700/60">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Cloud className="text-emerald-400" size={22} />
            Firebase Cloud Synchronization & Multi-Device Access
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Connect your company's Google Firebase project to sync warehouse inventory, POs, and employee accounts across multiple team devices.
          </p>
        </div>

        {/* Live Status Pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {status === 'connected' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Cloud Connected
            </div>
          )}
          {status === 'syncing' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
              <RefreshCw size={13} className="animate-spin" />
              Syncing...
            </div>
          )}
          {status === 'offline' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
              <Radio size={13} />
              Offline Mode
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              <AlertCircle size={13} />
              Connection Error
            </div>
          )}
          {status === 'disconnected' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-700/50 border border-slate-600 text-slate-400 text-xs font-medium">
              <CloudRain size={13} />
              Disconnected
            </div>
          )}
        </div>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between border ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : statusMessage.type === 'error'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            : 'bg-slate-700/50 border-slate-600 text-slate-300'
        }`}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white font-bold ml-4">✕</button>
        </div>
      )}

      {/* ACTIVE CLOUD STATUS & ONE-CLICK ACTIONS */}
      {status === 'connected' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 shadow-lg space-y-3">
            <div className="text-xs text-slate-400 font-medium">Connected Firebase Project</div>
            <div className="text-lg font-mono font-bold text-white flex items-center gap-2">
              <Key size={16} className="text-emerald-400" />
              {activeConfig?.projectId}
            </div>
            <div className="text-[11px] text-slate-400">
              Workspace ID: <span className="font-mono text-emerald-300 font-semibold">{workspaceId}</span>
            </div>
            <button
              onClick={handleDisconnect}
              className="mt-2 text-xs text-rose-400 hover:text-rose-300 underline font-medium"
            >
              Disconnect Cloud Project
            </button>
          </div>

          <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 shadow-lg flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-2 mb-1">
                <UploadCloud size={16} className="text-emerald-400" />
                Push Local Data to Cloud
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Upload your local items, inventory stock, POs, and employee accounts to Firebase so staff on other computers can access them.
              </p>
            </div>
            <button
              onClick={handlePushData}
              disabled={isPushing}
              className="w-full mt-4 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isPushing ? <RefreshCw size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              {isPushing ? 'Uploading to Firebase...' : 'Push Local ERP to Cloud'}
            </button>
          </div>

          <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 shadow-lg flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-2 mb-1">
                <DownloadCloud size={16} className="text-teal-400" />
                Pull Cloud Data to Local
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Download the latest cloud state into this computer's local SQLite database. Ideal for employee PCs or branches.
              </p>
            </div>
            <button
              onClick={handlePullData}
              disabled={isPulling}
              className="w-full mt-4 py-2 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium text-xs border border-slate-600 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isPulling ? <RefreshCw size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
              {isPulling ? 'Downloading from Cloud...' : 'Pull Cloud ERP to Local'}
            </button>
          </div>
        </div>
      )}

      {/* SETUP & CONNECTION FORM */}
      <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/80 shadow-xl space-y-5">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Key className="text-emerald-400" size={18} />
            {status === 'connected' ? 'Update Firebase Cloud Configuration' : 'Connect Your Google Firebase Project'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            In your Google Firebase Console (free tier supported), create a project, enable <strong>Firestore Database</strong>, and paste the Web App configuration snippet below.
          </p>
        </div>

        <form onSubmit={handleConnect} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Cloud Workspace ID (Company Code) *
              </label>
              <input
                type="text"
                required
                value={workspaceInput}
                onChange={(e) => setWorkspaceInput(e.target.value.toUpperCase())}
                placeholder="e.g. PROBAHO-SUPPLY-CHAIN"
                style={{ paddingLeft: '14px' }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                All employee devices must enter this exact Workspace ID to access the shared data.
              </span>
            </div>

            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/60 text-xs space-y-1">
              <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <ShieldCheck size={14} /> Free Tier &amp; Security Rules
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                In Firebase Console &rarr; Firestore Database &rarr; <em>Rules</em>, set:
                <code className="block bg-slate-950 p-1.5 rounded mt-1 font-mono text-[10px] text-emerald-400">
                  allow read, write: if true;
                </code>
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Firebase Config Snippet (Paste JSON or JavaScript snippet) *
            </label>
            <textarea
              required
              rows={6}
              value={configInput}
              onChange={(e) => setConfigInput(e.target.value)}
              placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "my-app.firebaseapp.com",\n  projectId: "my-erp-project",\n  storageBucket: "my-app.appspot.com",\n  messagingSenderId: "...",\n  appId: "1:...:web:..."\n};`}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500 leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={isConnecting || !configInput.trim()}
              className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-lg shadow-emerald-600/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isConnecting ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <CloudLightning size={14} />
              )}
              {isConnecting ? 'Verifying with Google Firebase...' : 'Test & Connect to Firebase Cloud'}
            </button>
          </div>
        </form>
      </div>

      {/* MULTI-EMPLOYEE WORKFLOW GUIDE */}
      <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/60 space-y-3">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Users size={15} className="text-emerald-400" />
          How Multi-Employee Cloud Access Works
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-1.5">
            <div className="font-bold text-emerald-400">Step 1: Master Setup</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              The Master Admin creates employee IDs (e.g. <code>@rahim_pos</code>) under <strong>Staff &amp; Access Control</strong> and connects to Firebase.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-1.5">
            <div className="font-bold text-emerald-400">Step 2: Push Data to Cloud</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Click <strong>Push Local ERP to Cloud</strong> to securely store all inventory, POs, and employee accounts in Firebase Firestore.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-1.5">
            <div className="font-bold text-emerald-400">Step 3: Employee PC Sign In</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Employees launch the software, connect with the same Workspace ID, and sign in with their assigned Staff Login ID and PIN!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudSyncView;
