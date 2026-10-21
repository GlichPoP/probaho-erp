// ============================================================================
// PROBAHO ERP: STAFF & EMPLOYEE ACCESS MANAGEMENT VIEW
// File: src/views/StaffManagementView.tsx
// Features: Master ID Delegation, Role-Based Access Control, Credential Slips
// ============================================================================

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  UserPlus, 
  Trash2, 
  Check, 
  X, 
  Lock, 
  Unlock, 
  Crown, 
  Edit, 
  Shield, 
  Share2, 
  Copy, 
  CheckCircle2, 
  Building2,
  KeyRound,
  Sparkles,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { 
  authService, 
  type UserAccount, 
  type UserRole, 
  ALL_ERP_MODULE_TABS, 
  ROLE_PRESET_TABS 
} from '../services/authService';

interface StaffManagementViewProps {
  currentUser?: UserAccount | null;
  onRefreshUsers?: () => void;
}

export const StaffManagementView: React.FC<StaffManagementViewProps> = ({ 
  currentUser,
  onRefreshUsers 
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create Staff Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newEmailOrPhone, setNewEmailOrPhone] = useState<string>('');
  const [newDesignation, setNewDesignation] = useState<string>('Showroom Cashier');
  const [newRole, setNewRole] = useState<UserRole>('cashier');
  const [newPasswordOrPin, setNewPasswordOrPin] = useState<string>('1234');
  const [newAllowedTabs, setNewAllowedTabs] = useState<string[]>(ROLE_PRESET_TABS.cashier);

  // Edit Staff Modal State
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editEmailOrPhone, setEditEmailOrPhone] = useState<string>('');
  const [editDesignation, setEditDesignation] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('employee');
  const [editPasswordOrPin, setEditPasswordOrPin] = useState<string>('');
  const [editAllowedTabs, setEditAllowedTabs] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);

  // Share Slip Modal State
  const [sharingUser, setSharingUser] = useState<UserAccount | null>(null);
  const [copiedSlip, setCopiedSlip] = useState<boolean>(false);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const all = await authService.getAllUsers();
      setUsers(all);
    } catch (err) {
      console.warn('Error loading users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRolePresetChange = (role: UserRole) => {
    setNewRole(role);
    setNewAllowedTabs(ROLE_PRESET_TABS[role] || ROLE_PRESET_TABS.employee);
    if (role === 'cashier') setNewDesignation('Showroom Cashier');
    else if (role === 'warehouse_staff') setNewDesignation('Warehouse Associate');
    else if (role === 'logistics') setNewDesignation('Logistics Specialist');
    else if (role === 'manager') setNewDesignation('Operations Manager');
  };

  const handleToggleTab = (tabId: string, currentTabs: string[], setter: (tabs: string[]) => void) => {
    if (currentTabs.includes(tabId)) {
      if (currentTabs.length === 1) return; // Prevent empty tabs
      setter(currentTabs.filter(t => t !== tabId));
    } else {
      setter([...currentTabs, tabId]);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const res = await authService.createStaffAccount({
      name: newName,
      username: newUsername,
      emailOrPhone: newEmailOrPhone,
      role: newRole,
      designation: newDesignation,
      passwordOrPin: newPasswordOrPin,
      allowedTabs: newAllowedTabs,
      createdBy: currentUser?.name || 'Master Admin'
    });

    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
      setIsCreateModalOpen(false);
      setNewName('');
      setNewUsername('');
      setNewEmailOrPhone('');
      setNewPasswordOrPin('1234');
      await loadUsers();
      if (onRefreshUsers) onRefreshUsers();
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const res = await authService.updateStaffAccount(editingUser.id, {
      name: editName,
      emailOrPhone: editEmailOrPhone,
      role: editRole,
      designation: editDesignation,
      passwordOrPin: editPasswordOrPin.trim() || undefined,
      allowedTabs: editAllowedTabs,
      isActive: editIsActive
    });

    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
      setEditingUser(null);
      await loadUsers();
      if (onRefreshUsers) onRefreshUsers();
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleToggleActive = async (u: UserAccount) => {
    const res = await authService.toggleUserActive(u.id, !u.is_active);
    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
      await loadUsers();
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleDeleteUser = async (u: UserAccount) => {
    if (!confirm(`Are you sure you want to permanently delete the account for ${u.name} (@${u.username})?`)) {
      return;
    }
    const res = await authService.deleteUser(u.id);
    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
      await loadUsers();
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const getCredentialSlipText = (u: UserAccount) => {
    const allowed = (u.allowed_tabs || [])
      .map(id => ALL_ERP_MODULE_TABS.find(t => t.id === id)?.label || id)
      .join(', ');

    return `🏢 *PROBAHO ERP — OFFICIAL STAFF CREDENTIAL SLIP*\n\n` +
      `👋 Welcome to the team, *${u.name}*!\n` +
      `Your employee access ID has been created:\n\n` +
      `👤 *Staff Login ID:* ${u.username}\n` +
      `🔑 *Initial Password / PIN:* ${u.pin_code || '1234'}\n` +
      `💼 *Designation:* ${u.designation || 'Staff Associate'}\n` +
      `🛡️ *Role:* ${u.role.toUpperCase()}\n` +
      `📋 *Assigned Modules:* ${allowed}\n\n` +
      `💻 *How to Sign In:*\n` +
      `1. Open the Probaho ERP desktop application.\n` +
      `2. Enter your Staff Login ID and PIN.\n` +
      `3. For security, ask Master Admin if you need to update permissions.`;
  };

  const handleCopySlip = (u: UserAccount) => {
    const text = getCredentialSlipText(u);
    navigator.clipboard.writeText(text);
    setCopiedSlip(true);
    setTimeout(() => setCopiedSlip(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/60 p-5 rounded-2xl border border-slate-700/60">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Users className="text-emerald-400" size={22} />
            Staff & Employee Access Control
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Create employee IDs, assign role permissions, and regulate staff access to POS counters, inventory, and procurement.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-md shadow-emerald-600/20 transition-all self-start sm:self-auto"
        >
          <UserPlus size={15} />
          Create Employee ID
        </button>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Users Table / Grid */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-700/80">
              <tr>
                <th className="py-3.5 px-4">User & Role</th>
                <th className="py-3.5 px-4">Login ID / Username</th>
                <th className="py-3.5 px-4">Designation</th>
                <th className="py-3.5 px-4">Allowed Modules</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {users.map((u) => {
                const isMaster = u.role === 'master';
                const roleBadgeColor = isMaster 
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                  : u.role === 'manager'
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  : u.role === 'cashier'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-blue-500/15 text-blue-300 border-blue-500/30';

                return (
                  <tr key={u.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isMaster ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-200'
                        }`}>
                          {isMaster ? <Crown size={15} /> : u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                            {u.name}
                            {isMaster && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                                MASTER
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {u.email_or_phone || 'Offline local account'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">
                      @{u.username}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${roleBadgeColor}`}>
                        {u.designation || u.role}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {isMaster ? (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                            Full Enterprise Access (All Modules)
                          </span>
                        ) : (
                          (u.allowed_tabs || []).map(tabId => {
                            const tab = ALL_ERP_MODULE_TABS.find(t => t.id === tabId);
                            return (
                              <span key={tabId} className="text-[9px] bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded">
                                {tab ? tab.label.split(' ')[0] : tabId}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Suspended
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Share Credential Slip */}
                        <button
                          onClick={() => { setSharingUser(u); setCopiedSlip(false); }}
                          title="Copy / View Employee Access Slip"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-700/60 transition-colors"
                        >
                          <Share2 size={14} />
                        </button>

                        {/* Edit Staff Account */}
                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setEditName(u.name);
                            setEditEmailOrPhone(u.email_or_phone || '');
                            setEditRole(u.role);
                            setEditDesignation(u.designation || '');
                            setEditAllowedTabs(u.allowed_tabs || []);
                            setEditIsActive(u.is_active);
                            setEditPasswordOrPin('');
                          }}
                          title="Edit Account Details"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
                        >
                          <Edit size={14} />
                        </button>

                        {/* Kill Switch (Activate / Suspend) */}
                        {!isMaster && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            title={u.is_active ? "Lock / Deactivate Account" : "Reactivate Account"}
                            className={`p-1.5 rounded-lg transition-colors ${
                              u.is_active 
                                ? 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/10' 
                                : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            {u.is_active ? <Unlock size={14} /> : <Lock size={14} />}
                          </button>
                        )}

                        {/* Delete Staff Account */}
                        {!isMaster && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            title="Delete Account"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: CREATE NEW STAFF / EMPLOYEE ID */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <UserPlus className="text-emerald-400" size={17} />
                Create New Employee ID
              </h3>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Employee Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Staff Login ID / Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. john_pos"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Role Preset
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => handleRolePresetChange(e.target.value as UserRole)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="cashier">Showroom Cashier</option>
                    <option value="warehouse_staff">Warehouse Operator</option>
                    <option value="logistics">Logistics Specialist</option>
                    <option value="manager">Operations Manager</option>
                    <option value="employee">Standard Staff</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Job Title / Designation
                  </label>
                  <input
                    type="text"
                    value={newDesignation}
                    onChange={(e) => setNewDesignation(e.target.value)}
                    placeholder="e.g. Showroom Cashier"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Initial Password or Quick PIN *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPasswordOrPin}
                    onChange={(e) => setNewPasswordOrPin(e.target.value)}
                    placeholder="Min 4 chars / PIN"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Contact Email / Phone
                  </label>
                  <input
                    type="text"
                    value={newEmailOrPhone}
                    onChange={(e) => setNewEmailOrPhone(e.target.value)}
                    placeholder="Optional phone or email"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Granular Module Access Checkboxes */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-2">
                  Assigned Module Permissions
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
                  {ALL_ERP_MODULE_TABS.map((tab) => {
                    const isChecked = newAllowedTabs.includes(tab.id);
                    return (
                      <label 
                        key={tab.id}
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border text-xs transition-all ${
                          isChecked 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' 
                            : 'bg-slate-800/40 border-slate-700/40 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTab(tab.id, newAllowedTabs, setNewAllowedTabs)}
                          className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <div className="font-medium text-[11px] leading-tight">{tab.label}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20"
                >
                  Create Employee Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT EMPLOYEE MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Edit className="text-emerald-400" size={17} />
                Edit Account: {editingUser.name} (@{editingUser.username})
              </h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Designation</label>
                  <input
                    type="text"
                    value={editDesignation}
                    onChange={(e) => setEditDesignation(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Reset Password / PIN</label>
                  <input
                    type="text"
                    value={editPasswordOrPin}
                    onChange={(e) => setEditPasswordOrPin(e.target.value)}
                    placeholder="Leave blank to keep existing"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Account State</label>
                  <select
                    value={editIsActive ? 'active' : 'suspended'}
                    disabled={editingUser.role === 'master'}
                    onChange={(e) => setEditIsActive(e.target.value === 'active')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="active">Active & Authorized</option>
                    <option value="suspended">Suspended / Locked</option>
                  </select>
                </div>
              </div>

              {/* Module Permissions */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-2">
                  Assigned Module Permissions
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
                  {ALL_ERP_MODULE_TABS.map((tab) => {
                    const isChecked = editAllowedTabs.includes(tab.id);
                    return (
                      <label 
                        key={tab.id}
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border text-xs transition-all ${
                          isChecked 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' 
                            : 'bg-slate-800/40 border-slate-700/40 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTab(tab.id, editAllowedTabs, setEditAllowedTabs)}
                          className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-medium text-[11px] leading-tight">{tab.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CREDENTIAL SLIP PREVIEW & COPY */}
      {sharingUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <FileText className="text-emerald-400" size={17} />
                Employee Access Slip
              </h3>
              <button 
                onClick={() => setSharingUser(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed border border-slate-700/80 mb-4 select-all max-h-60 overflow-y-auto">
              {getCredentialSlipText(sharingUser)}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSharingUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Close
              </button>
              <button
                onClick={() => handleCopySlip(sharingUser)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-600/20"
              >
                {copiedSlip ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copiedSlip ? 'Copied to Clipboard!' : 'Copy Credential Slip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
