import React, { useState, useEffect } from 'react';
import {
  Palette,
  Database,
  Building,
  Info,
  Download,
  Upload,
  RotateCcw,
  Check,
  AlertTriangle,
  ShieldCheck,
  HardDrive,
  Clock,
  Users,
  Cloud,
  UploadCloud,
  Image as ImageIcon,
  Trash2,
  Sparkles,
  FileText
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { backupService } from '../services/backupService';
import { dbService } from '../services/db';
import { StaffManagementView } from './StaffManagementView';
import { CloudSyncView } from './CloudSyncView';
import { ProbahoLogo } from '../components/ProbahoLogo';
import { processCompanyLogoFile } from '../utils/imageUtils';
import type { UserAccount } from '../services/authService';

export type SettingsTab = 'appearance' | 'staff' | 'cloud' | 'database' | 'company' | 'about';

interface SettingsViewProps {
  onRefreshAll?: () => void;
  currentUser?: UserAccount | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onRefreshAll, currentUser }) => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  // Database stats & status
  const [dbStats, setDbStats] = useState<{
    tableCount: number;
    recordCount: number;
    filePath: string;
    lastSaved: string;
  }>({
    tableCount: 16,
    recordCount: 0,
    filePath: '%APPDATA%/Probaho ERP/probaho_erp.db',
    lastSaved: new Date().toLocaleTimeString()
  });

  // Action status messages
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // Operational Settings State
  const [operationalSettings, setOperationalSettings] = useState<{
    companyName: string;
    companyLogo: string;
    defaultCurrency: string;
    valuationMethod: string;
    negativeInventoryAllowed: string;
  }>({
    companyName: 'Probaho Supply Chain Ltd.',
    companyLogo: '',
    defaultCurrency: 'USD',
    valuationMethod: 'MOVING_AVERAGE',
    negativeInventoryAllowed: '0'
  });
  const [isProcessingLogo, setIsProcessingLogo] = useState<boolean>(false);

  // Load database metadata and settings
  useEffect(() => {
    loadDatabaseStats();
    loadOperationalSettings();
    if (typeof window !== 'undefined' && (window as any).electronAPI?.appGetPath) {
      (window as any).electronAPI.appGetPath('userData').then((userPath: string) => {
        if (userPath) {
          setDbStats((prev) => ({
            ...prev,
            filePath: `${userPath}/probaho_erp.db`
          }));
        }
      }).catch(() => {});
    }
  }, []);

  const loadDatabaseStats = async () => {
    try {
      if (dbService && dbService.query) {
        const tables = await dbService.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
        );
        setDbStats((prev) => ({
          ...prev,
          tableCount: tables.length,
          lastSaved: new Date().toLocaleTimeString()
        }));
      }
    } catch (err) {
      console.warn('Could not read table count from SQLite:', err);
    }
  };

  const loadOperationalSettings = async () => {
    try {
      if (dbService && dbService.query) {
        const rows = await dbService.query<{ key: string; value: string }>(
          "SELECT key, value FROM system_settings WHERE key IN ('company_name', 'company_logo', 'default_currency', 'default_valuation_method', 'negative_inventory_allowed');"
        );
        const map = new Map<string, string>();
        rows.forEach((r) => map.set(r.key, r.value));
        setOperationalSettings({
          companyName: map.get('company_name') || 'Probaho Supply Chain Ltd.',
          companyLogo: map.get('company_logo') || '',
          defaultCurrency: map.get('default_currency') || 'USD',
          valuationMethod: map.get('default_valuation_method') || 'MOVING_AVERAGE',
          negativeInventoryAllowed: '0'
        });
      }
    } catch (err) {
      console.warn('Could not read operational settings from SQLite:', err);
    }
  };

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingLogo(true);
      showNotification('info', `Converting ${file.name} into company logo...`);
      const dataUrl = await processCompanyLogoFile(file);
      setOperationalSettings((prev) => ({ ...prev, companyLogo: dataUrl }));

      // Auto-save immediately to SQLite system_settings
      await dbService.execute(
        `INSERT INTO system_settings (key, value, category, description, updated_at)
         VALUES ('company_logo', ?, 'company', 'Uploaded company brand logo', (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
         ON CONFLICT(key) DO UPDATE SET 
           value = excluded.value, 
           updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,
        [dataUrl]
      );

      showNotification('success', `Company logo uploaded successfully from ${file.name}! Automatically updated at the top left corner.`);
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      showNotification('error', `Failed to process logo file: ${err.message || String(err)}`);
    } finally {
      setIsProcessingLogo(false);
      e.target.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    try {
      setOperationalSettings((prev) => ({ ...prev, companyLogo: '' }));
      await dbService.execute(
        `INSERT INTO system_settings (key, value, category, description, updated_at)
         VALUES ('company_logo', '', 'company', 'Uploaded company brand logo', (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
         ON CONFLICT(key) DO UPDATE SET 
           value = '', 
           updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`
      );
      showNotification('info', 'Company logo removed. Monogram badge restored in top-left sidebar.');
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      showNotification('error', `Failed to remove logo: ${err.message || String(err)}`);
    }
  };

  const handleSaveOperationalSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setIsSavingSettings(true);
      const settingsToSave = [
        { key: 'company_name', value: operationalSettings.companyName, category: 'company', description: 'Registered enterprise company name' },
        { key: 'company_logo', value: operationalSettings.companyLogo, category: 'company', description: 'Uploaded enterprise company logo' },
        { key: 'default_currency', value: operationalSettings.defaultCurrency, category: 'finance', description: 'Default operating currency' },
        { key: 'default_valuation_method', value: operationalSettings.valuationMethod, category: 'inventory', description: 'Default stock valuation' },
        { key: 'negative_inventory_allowed', value: '0', category: 'inventory', description: '0 = Strict prevent negative stock' }
      ];

      for (const s of settingsToSave) {
        await dbService.execute(
          `INSERT INTO system_settings (key, value, category, description, updated_at)
           VALUES (?, ?, ?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
           ON CONFLICT(key) DO UPDATE SET 
             value = excluded.value, 
             category = excluded.category,
             description = excluded.description,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,
          [s.key, s.value, s.category, s.description]
        );
      }
      showNotification('success', 'Company operational parameters & logo saved successfully to SQLite.');
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      showNotification('error', `Failed to save operational settings: ${err.message || String(err)}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const showNotification = (type: 'success' | 'error' | 'info', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // 1. Export JSON Snapshot
  const handleExportJson = async () => {
    try {
      setIsExporting(true);
      const jsonStr = await backupService.exportJsonSnapshot();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.href = url;
      link.download = `probaho_erp_backup_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification('success', 'Verified JSON data snapshot exported successfully.');
    } catch (err: any) {
      showNotification('error', `JSON Backup failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 2. Export Raw SQLite Binary (.db)
  const handleExportBinaryDb = async () => {
    try {
      setIsExporting(true);
      const binaryBytes = await backupService.exportBinaryBlob();
      const blob = new Blob([binaryBytes as unknown as BlobPart], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.href = url;
      link.download = `probaho_erp_${timestamp}.db`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification('success', 'SQLite 3 binary database (.db) exported successfully.');
    } catch (err: any) {
      showNotification('error', `SQLite Binary Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 3. Import / Restore Handler
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        await backupService.importJsonSnapshot(text);
        showNotification('success', `Database restored successfully from JSON snapshot (${file.name}).`);
      } else if (file.name.endsWith('.db') || file.name.endsWith('.sqlite')) {
        const buffer = await file.arrayBuffer();
        await backupService.importBinaryBlob(new Uint8Array(buffer));
        showNotification('success', `Database restored successfully from SQLite binary (${file.name}).`);
      } else {
        throw new Error('Unsupported backup file format. Please select a .json or .db/.sqlite file.');
      }
      await loadDatabaseStats();
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      showNotification('error', `Restore failed: ${err.message}`);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  // 4. Reset to Seed Demo Data
  const handleResetToSeeds = async () => {
    try {
      setShowResetConfirm(false);
      if (dbService && dbService.resetToSeedData) {
        await dbService.resetToSeedData();
        showNotification('success', 'Database reset to factory demo seed data successfully.');
        await loadDatabaseStats();
        if (onRefreshAll) onRefreshAll();
      }
    } catch (err: any) {
      showNotification('error', `Reset failed: ${err.message}`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">System & Preferences</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Manage workspace visual modes, offline SQLite backup/recovery, and enterprise parameters.
        </p>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-lg border text-sm flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'badge-success bg-[var(--emerald-bg)] border-[var(--emerald-border)] text-[var(--emerald)]'
              : statusMessage.type === 'error'
              ? 'badge-danger bg-[var(--ruby-bg)] border-[var(--ruby-border)] text-[var(--ruby)]'
              : 'badge-info bg-[var(--cyan-bg)] border-[var(--cyan-border)] text-[var(--cyan)]'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="font-bold ml-4">✕</button>
        </div>
      )}

      {/* Sub-Tab Navigation Bar */}
      <div className="flex gap-2 border-b pb-2 flex-wrap" style={{ borderColor: 'var(--border-color)' }}>
        <button
          onClick={() => setActiveTab('appearance')}
          className={`btn ${activeTab === 'appearance' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Palette size={16} />
          <span>Appearance & Themes</span>
        </button>

        <button
          onClick={() => setActiveTab('staff')}
          className={`btn ${activeTab === 'staff' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Users size={16} />
          <span>Staff & Access Control</span>
        </button>

        <button
          onClick={() => setActiveTab('cloud')}
          className={`btn ${activeTab === 'cloud' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Cloud size={16} />
          <span>Cloud Sync & Firebase</span>
        </button>

        <button
          onClick={() => setActiveTab('database')}
          className={`btn ${activeTab === 'database' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Database size={16} />
          <span>SQLite Database & Backup</span>
        </button>

        <button
          onClick={() => setActiveTab('company')}
          className={`btn ${activeTab === 'company' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Building size={16} />
          <span>Company & Supply Chain</span>
        </button>

        <button
          onClick={() => setActiveTab('about')}
          className={`btn ${activeTab === 'about' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Info size={16} />
          <span>About & Diagnostics</span>
        </button>
      </div>

      {/* ----------------------------------------------------------------------
          TAB 1: APPEARANCE & THEMES
          ---------------------------------------------------------------------- */}
      {activeTab === 'appearance' && (
        <div className="erp-card p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-[var(--text-main)] mb-1">Visual Theme Mode</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Select an enterprise theme. High contrast ratios (&gt;4.5:1) are maintained across all modes for sustained operational readability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Dark Mode Card */}
            <div
              onClick={() => setTheme('dark')}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover-lift relative flex flex-col gap-3 ${
                theme === 'dark' ? 'border-[var(--accent-primary)] shadow-md' : 'border-[var(--border-color)]'
              }`}
              style={{ backgroundColor: '#182234', color: '#F8FAFC' }}
            >
              {theme === 'dark' && (
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Check size={12} />
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-950 text-indigo-400">
                  <Database size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">1. Dark Mode</h3>
                  <span className="text-[11px] text-slate-400">Deep Obsidian (#0B0F19)</span>
                </div>
              </div>
              <p className="text-xs text-slate-300">
                Optimized for low-light environments with luminous emerald/amber status indicators.
              </p>
              <div className="flex gap-1.5 mt-auto pt-2 border-t border-slate-700">
                <span className="w-4 h-4 rounded bg-[#0B0F19] border border-slate-600" />
                <span className="w-4 h-4 rounded bg-[#6366F1]" />
                <span className="w-4 h-4 rounded bg-[#34D399]" />
                <span className="w-4 h-4 rounded bg-[#F87171]" />
              </div>
            </div>

            {/* Light Mode Card */}
            <div
              onClick={() => setTheme('light')}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover-lift relative flex flex-col gap-3 ${
                theme === 'light' ? 'border-[var(--accent-primary)] shadow-md' : 'border-[var(--border-color)]'
              }`}
              style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}
            >
              {theme === 'light' && (
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Check size={12} />
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600">
                  <Database size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">2. Light Mode</h3>
                  <span className="text-[11px] text-slate-500">Crisp Slate (#F8FAFC)</span>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Daylight office contrast with deep slate typography (17.4:1 contrast ratio).
              </p>
              <div className="flex gap-1.5 mt-auto pt-2 border-t border-slate-200">
                <span className="w-4 h-4 rounded bg-[#F8FAFC] border border-slate-300" />
                <span className="w-4 h-4 rounded bg-[#4F46E5]" />
                <span className="w-4 h-4 rounded bg-[#047857]" />
                <span className="w-4 h-4 rounded bg-[#B91C1C]" />
              </div>
            </div>

            {/* Gray Mode Card */}
            <div
              onClick={() => setTheme('gray')}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover-lift relative flex flex-col gap-3 ${
                theme === 'gray' ? 'border-[var(--accent-primary)] shadow-md' : 'border-[var(--border-color)]'
              }`}
              style={{ backgroundColor: '#27272A', color: '#FAFAFA' }}
            >
              {theme === 'gray' && (
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Check size={12} />
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-800 text-zinc-300">
                  <Database size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">3. Gray (Zinc)</h3>
                  <span className="text-[11px] text-zinc-400">Neutral Matte (#18181B)</span>
                </div>
              </div>
              <p className="text-xs text-zinc-300">
                Subdued neutral dark theme reducing eye fatigue during continuous data entry.
              </p>
              <div className="flex gap-1.5 mt-auto pt-2 border-t border-zinc-700">
                <span className="w-4 h-4 rounded bg-[#18181B] border border-zinc-600" />
                <span className="w-4 h-4 rounded bg-[#818CF8]" />
                <span className="w-4 h-4 rounded bg-[#34D399]" />
                <span className="w-4 h-4 rounded bg-[#F87171]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          TAB: STAFF & ACCESS CONTROL
          ---------------------------------------------------------------------- */}
      {activeTab === 'staff' && (
        <StaffManagementView currentUser={currentUser} onRefreshUsers={onRefreshAll} />
      )}

      {/* ----------------------------------------------------------------------
          TAB: FIREBASE CLOUD SYNC
          ---------------------------------------------------------------------- */}
      {activeTab === 'cloud' && (
        <CloudSyncView onRefreshAll={onRefreshAll} />
      )}

      {/* ----------------------------------------------------------------------
          TAB 2: SQLITE DATABASE & BACKUP
          ---------------------------------------------------------------------- */}
      {activeTab === 'database' && (
        <div className="space-y-6">
          {/* Health & Storage Overview */}
          <div className="erp-card p-6">
            <h2 className="text-base font-bold text-[var(--text-main)] mb-4 flex items-center gap-2">
              <HardDrive size={18} style={{ color: 'var(--accent-primary)' }} />
              <span>Offline Database Status & Telemetry</span>
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-lg border bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border-color)' }}>
                <span className="text-[11px] text-[var(--text-dim)] uppercase font-semibold">Engine</span>
                <p className="text-sm font-bold text-[var(--text-main)] mt-0.5">SQLite 3 (WASM)</p>
              </div>

              <div className="p-3.5 rounded-lg border bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border-color)' }}>
                <span className="text-[11px] text-[var(--text-dim)] uppercase font-semibold">Schema Tables</span>
                <p className="text-sm font-bold text-[var(--emerald)] mt-0.5">{dbStats.tableCount} Core Tables</p>
              </div>

              <div className="p-3.5 rounded-lg border bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border-color)' }}>
                <span className="text-[11px] text-[var(--text-dim)] uppercase font-semibold">Journal Mode</span>
                <p className="text-sm font-bold text-[var(--text-main)] mt-0.5">WAL (Write-Ahead)</p>
              </div>

              <div className="p-3.5 rounded-lg border bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border-color)' }}>
                <span className="text-[11px] text-[var(--text-dim)] uppercase font-semibold">Last Disk Sync</span>
                <p className="text-sm font-bold text-[var(--text-muted)] mt-0.5">{dbStats.lastSaved}</p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-[var(--bg-hover)] text-xs text-[var(--text-dim)] flex items-center gap-2">
              <Clock size={14} />
              <span>Disk snapshot destination: </span>
              <code className="chip-mono">{dbStats.filePath}</code>
            </div>
          </div>

          {/* Export & Backup Section */}
          <div className="erp-card p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text-main)] mb-1">Export Database Backup</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Generate zero-loss backups for disaster recovery or cross-machine migration.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleExportJson}
                disabled={isExporting}
                className="btn btn-primary"
              >
                <Download size={16} />
                <span>Export JSON Snapshot</span>
              </button>

              <button
                onClick={handleExportBinaryDb}
                disabled={isExporting}
                className="btn btn-secondary"
              >
                <Download size={16} />
                <span>Export SQLite Binary (.db)</span>
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-dim)]">
              * The JSON snapshot includes relational table schemas and SHA-256 data integrity checksums.
            </p>
          </div>

          {/* Import / Restore Section */}
          <div className="erp-card p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text-main)] mb-1">Restore Database from Backup</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Restoring replaces current database tables with data from the backup file. A temporary safety snapshot is automatically created prior to restore.
              </p>
            </div>

            <div className="p-4 border-2 border-dashed rounded-lg text-center flex flex-col items-center justify-center gap-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-hover)' }}>
              <Upload size={24} style={{ color: 'var(--accent-primary)' }} />
              <div>
                <label className="btn btn-secondary cursor-pointer">
                  <span>Select Backup File (.json, .db, .sqlite)</span>
                  <input
                    type="file"
                    accept=".json,.db,.sqlite"
                    onChange={handleRestoreFile}
                    disabled={isImporting}
                    className="hidden"
                  />
                </label>
              </div>
              <span className="text-xs text-[var(--text-dim)]">
                {isImporting ? 'Validating and restoring database...' : 'Accepts verified Probaho JSON snapshots or raw SQLite 3 binary files.'}
              </span>
            </div>
          </div>

          {/* Danger Zone: Factory Reset */}
          <div className="erp-card p-6 border-red-500/30 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[var(--ruby)] mb-1 flex items-center gap-2">
                <AlertTriangle size={17} />
                <span>Reset Database to Factory Demo Seeds</span>
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Re-seeds initial demo items, Central DC and North Regional warehouses, suppliers, bins, and couriers.
              </p>
            </div>

            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="btn btn-danger"
              >
                <RotateCcw size={15} />
                <span>Reset to Seed Data</span>
              </button>
            ) : (
              <div className="p-4 rounded-lg bg-[var(--ruby-bg)] border border-[var(--ruby-border)] space-y-3">
                <p className="text-xs font-semibold text-[var(--ruby)]">
                  Are you absolutely sure? All transactional purchase orders, shipments, and inventory movements will be cleared!
                </p>
                <div className="flex gap-3">
                  <button onClick={handleResetToSeeds} className="btn btn-danger">
                    Yes, Confirm Reset
                  </button>
                  <button onClick={() => setShowResetConfirm(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          TAB 3: COMPANY & SUPPLY CHAIN PARAMETERS
          ---------------------------------------------------------------------- */}
      {activeTab === 'company' && (
        <div className="space-y-6">
          {/* Section 1: Official Company Brand & Logo Management */}
          <div className="erp-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
              <div>
                <h2 className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
                  <ImageIcon size={18} style={{ color: 'var(--accent-primary)' }} />
                  <span>Official Enterprise Company Logo</span>
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Upload your company logo. Automatically accepts any format (PNG, JPG, SVG, WebP, GIF, or PDF document) and scales it crisply.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="btn btn-secondary cursor-pointer hover-lift text-xs">
                  <UploadCloud size={14} />
                  <span>{isProcessingLogo ? 'Converting...' : operationalSettings.companyLogo ? 'Change Logo' : 'Upload Logo'}</span>
                  <input
                    type="file"
                    accept="image/*,.svg,.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.ico,application/pdf"
                    onChange={handleLogoFileUpload}
                    disabled={isProcessingLogo}
                    className="hidden"
                  />
                </label>

                {operationalSettings.companyLogo && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="btn btn-secondary hover-lift text-xs text-rose-400"
                    title="Remove custom logo and revert to monogram"
                  >
                    <Trash2 size={14} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dual Live Preview: Sidebar Header & Print Waybill */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Preview 1: Top-Left Sidebar Appearance */}
              <div className="p-4 rounded-xl border space-y-2.5" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    1. Top-Left Corner Preview
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
                    Auto-Adjusted
                  </span>
                </div>

                {/* Simulation of the actual top-left corner */}
                <div className="rounded-lg border p-2.5 space-y-2 select-none" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                  {/* Top Bar: Probaho ERP */}
                  <div className="flex items-center gap-2 pb-2 border-b text-[11px]" style={{ borderColor: 'var(--border-color)' }}>
                    <ProbahoLogo size={16} />
                    <span className="font-semibold text-[var(--titlebar-text)]">Probaho ERP</span>
                    <span className="text-[9px] px-1 py-0.2 rounded font-mono text-[var(--text-dim)]">v1.0.0</span>
                  </div>

                  {/* Below TitleBar: Company Identity */}
                  <div className="flex items-center gap-2.5 pt-0.5">
                    {operationalSettings.companyLogo ? (
                      <img
                        src={operationalSettings.companyLogo}
                        alt={operationalSettings.companyName}
                        className="w-8 h-8 rounded-lg object-contain bg-white/5 border border-slate-700/50 p-0.5 shadow-sm shrink-0"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm shrink-0 border"
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          borderColor: 'rgba(16, 185, 129, 0.35)',
                          color: '#10B981'
                        }}
                      >
                        {(operationalSettings.companyName || 'P').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[var(--text-main)] truncate">
                        {operationalSettings.companyName || 'Probaho Supply Chain Ltd.'}
                      </div>
                      <div className="text-[10px] text-[var(--text-dim)]">
                        Enterprise Workspace
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-[var(--text-dim)]">
                  The green Probaho ERP logo sits at the very top. Directly beneath it, your company logo and name are visible.
                </p>
              </div>

              {/* Preview 2: Official Document / Waybill Preview */}
              <div className="p-4 rounded-xl border space-y-2.5" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    2. Voucher &amp; Invoice Header
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-700/40 text-slate-300">
                    A4 Printable
                  </span>
                </div>

                <div className="rounded-lg border p-3 bg-white text-slate-900 flex items-center justify-between select-none shadow-sm" style={{ minHeight: '68px' }}>
                  <div className="space-y-0.5">
                    <div className="text-xs font-black tracking-tight uppercase">
                      {operationalSettings.companyName || 'PROBAHO SUPPLY CHAIN LTD.'}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono">
                      OFFICIAL GOODS RECEIPT &amp; PURCHASE ORDER SLIP
                    </div>
                  </div>

                  {operationalSettings.companyLogo ? (
                    <img
                      src={operationalSettings.companyLogo}
                      alt="Print Logo"
                      className="max-h-9 max-w-[120px] object-contain"
                    />
                  ) : (
                    <div className="text-[11px] font-bold text-emerald-700 border border-emerald-500 px-2 py-0.5 rounded">
                      {(operationalSettings.companyName || 'PROBAHO').slice(0, 16)}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-[var(--text-dim)]">
                  Automatically embedded into printable PO order slips, Goods Receipt Notes, and dispatch waybills.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Enterprise Operational Parameters */}
          <form onSubmit={handleSaveOperationalSettings} className="erp-card p-6 space-y-5">
            <h2 className="text-base font-bold text-[var(--text-main)] mb-1">Company & Operational Defaults</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Configure enterprise operating currency, registered company profile, and inventory valuation algorithms.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-dim)] mb-1">Company Legal Name</label>
                <input
                  type="text"
                  value={operationalSettings.companyName}
                  onChange={(e) => setOperationalSettings((prev) => ({ ...prev, companyName: e.target.value }))}
                  required
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-dim)] mb-1">Default Operating Currency</label>
                <select
                  value={operationalSettings.defaultCurrency}
                  onChange={(e) => setOperationalSettings((prev) => ({ ...prev, defaultCurrency: e.target.value }))}
                  className="input-field"
                >
                  <option value="USD">USD ($) — United States Dollar</option>
                  <option value="BDT">BDT (৳) — Bangladeshi Taka</option>
                  <option value="EUR">EUR (€) — Euro</option>
                  <option value="GBP">GBP (£) — British Pound</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-dim)] mb-1">Inventory Valuation Algorithm</label>
                <select
                  value={operationalSettings.valuationMethod}
                  onChange={(e) => setOperationalSettings((prev) => ({ ...prev, valuationMethod: e.target.value }))}
                  className="input-field"
                >
                  <option value="MOVING_AVERAGE">Weighted Moving Average Cost (WAC / MAC)</option>
                  <option value="FIFO">First-In, First-Out (FIFO) Lot Depletion</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-dim)] mb-1">
                  Negative Inventory Policy <span className="text-[var(--ruby)] text-[10px] ml-1">(Database Locked)</span>
                </label>
                <select
                  value="0"
                  disabled
                  className="input-field opacity-75 cursor-not-allowed bg-[var(--bg-tertiary)]"
                  title="Negative stock is strictly prohibited by SQLite schema CHECK constraints to prevent ledger corruption."
                >
                  <option value="0">Strict Prevention (Disallow negative inventory)</option>
                </select>
                <p className="text-[11px] text-[var(--text-dim)] mt-1">
                  Negative stock is strictly prohibited by database schema constraints (<code>quantity_on_hand &gt;= 0.0</code>) to ensure ledger invariants.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
              <button
                type="submit"
                disabled={isSavingSettings}
                className="btn btn-primary"
              >
                <Building size={15} />
                <span>{isSavingSettings ? 'Saving...' : 'Save Operational Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          TAB 4: ABOUT & DIAGNOSTICS
          ---------------------------------------------------------------------- */}
      {activeTab === 'about' && (
        <div className="erp-card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <ProbahoLogo size={44} glow={true} />
            <div>
              <h2 className="text-lg font-bold text-[var(--text-main)]">Probaho ERP Suite</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Open-source, lightweight, offline-first enterprise supply chain management suite.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[var(--bg-hover)] border" style={{ borderColor: 'var(--border-color)' }}>
              <span className="text-[var(--text-dim)] block">App Version</span>
              <strong className="text-[var(--text-main)] font-mono">1.0.0 (Release)</strong>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-hover)] border" style={{ borderColor: 'var(--border-color)' }}>
              <span className="text-[var(--text-dim)] block">UI Framework</span>
              <strong className="text-[var(--text-main)] font-mono">React 19 + Vite 8</strong>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-hover)] border" style={{ borderColor: 'var(--border-color)' }}>
              <span className="text-[var(--text-dim)] block">Persistence</span>
              <strong className="text-[var(--text-main)] font-mono">sql.js SQLite WASM</strong>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-hover)] border" style={{ borderColor: 'var(--border-color)' }}>
              <span className="text-[var(--text-dim)] block">Packaging</span>
              <strong className="text-[var(--text-main)] font-mono">NSIS &amp; Portable x64</strong>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[var(--emerald-bg)] border border-[var(--emerald-border)] flex items-start gap-3">
            <ShieldCheck size={20} className="text-[var(--emerald)] mt-0.5 flex-shrink-0" />
            <div className="text-xs text-[var(--emerald)]">
              <strong>Offline Architecture Guarantee:</strong> Probaho ERP executes all transactional logic, valuations, and queries on local CPU with an embedded SQLite 3 engine. No telemetry data is sent over the network, ensuring complete enterprise data confidentiality.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsView;
