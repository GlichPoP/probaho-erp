// ============================================================================
// PROBAHO ERP: SUPPLIERS & VENDOR MANAGEMENT VIEW
// File: src/views/SuppliersView.tsx (Proposed Specification for Milestone 2)
// High-Contrast Theme Compliant, Offline-First SQLite Powered
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Star,
  Clock,
  Phone,
  Mail,
  MapPin,
  Building2,
  Edit2,
  Eye,
  CheckCircle2,
  XCircle,
  X,
  RefreshCw,
  AlertCircle,
  Filter,
  ArrowUpDown,
  Check,
  Award,
  ShieldCheck,
  Percent,
  FileText
} from 'lucide-react';
import { dbService } from '../services/db';
import type { Supplier, CreateSupplierInput } from '../types/erp';

interface SupplierStats {
  totalSuppliers: number;
  activeSuppliers: number;
  avgLeadTime: number;
  topRatedSupplier: { name: string; score: number } | null;
}

export const SuppliersView: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'lead_time' | 'pos'>('rating');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedScorecardSupplier, setSelectedScorecardSupplier] = useState<Supplier | null>(null);

  // Notification Toast
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    supplier_code: '',
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    city: 'Dhaka',
    country: 'Bangladesh',
    tax_id: '',
    payment_terms_days: 30,
    lead_time_days: 7,
    rating: 5.0,
    notes: ''
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load suppliers from SQLite
  const loadSuppliers = async () => {
    try {
      setIsLoading(true);
      await dbService.initialize();
      const rows = await dbService.query<Supplier>(
        `SELECT * FROM suppliers ORDER BY name ASC;`
      );
      setSuppliers(rows);
    } catch (err: any) {
      console.error('Failed to load suppliers:', err);
      showToast('error', `Failed to load suppliers: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  // Compute KPI metrics
  const stats: SupplierStats = useMemo(() => {
    const total = suppliers.length;
    const active = suppliers.filter((s) => s.is_active === 1);
    const activeCount = active.length;
    const avgLead = activeCount > 0
      ? active.reduce((sum, s) => sum + (s.lead_time_days || 0), 0) / activeCount
      : 0;

    let topRated: { name: string; score: number } | null = null;
    if (suppliers.length > 0) {
      const sortedByScore = [...suppliers].sort(
        (a, b) => (b.performance_score || b.rating * 20) - (a.performance_score || a.rating * 20)
      );
      topRated = {
        name: sortedByScore[0].name,
        score: sortedByScore[0].performance_score || sortedByScore[0].rating * 20
      };
    }

    return {
      totalSuppliers: total,
      activeSuppliers: activeCount,
      avgLeadTime: Math.round(avgLead * 10) / 10,
      topRatedSupplier: topRated
    };
  }, [suppliers]);

  // Filter and sort suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers
      .filter((s) => {
        if (statusFilter === 'active' && s.is_active !== 1) return false;
        if (statusFilter === 'inactive' && s.is_active !== 0) return false;

        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          const matchCode = s.supplier_code.toLowerCase().includes(q);
          const matchName = s.name.toLowerCase().includes(q);
          const matchContact = (s.contact_person || '').toLowerCase().includes(q);
          const matchCity = (s.city || '').toLowerCase().includes(q);
          return matchCode || matchName || matchContact || matchCity;
        }
        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortBy === 'name') comp = a.name.localeCompare(b.name);
        else if (sortBy === 'rating') comp = (a.rating || 0) - (b.rating || 0);
        else if (sortBy === 'lead_time') comp = (a.lead_time_days || 0) - (b.lead_time_days || 0);
        else if (sortBy === 'pos') comp = (a.total_pos_fulfilled || 0) - (b.total_pos_fulfilled || 0);

        return sortOrder === 'asc' ? comp : -comp;
      });
  }, [suppliers, searchQuery, statusFilter, sortBy, sortOrder]);

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingSupplier(null);
    const nextCodeNum = suppliers.length + 1;
    const suggestedCode = `SUP-VEN-${String(nextCodeNum).padStart(3, '0')}`;
    setFormData({
      supplier_code: suggestedCode,
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      city: 'Dhaka',
      country: 'Bangladesh',
      tax_id: '',
      payment_terms_days: 30,
      lead_time_days: 7,
      rating: 5.0,
      notes: ''
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      supplier_code: supplier.supplier_code,
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      city: supplier.city || 'Dhaka',
      country: supplier.country || 'Bangladesh',
      tax_id: supplier.tax_id || '',
      payment_terms_days: supplier.payment_terms_days ?? 30,
      lead_time_days: supplier.lead_time_days ?? 7,
      rating: supplier.rating ?? 5.0,
      notes: supplier.notes || ''
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.supplier_code.trim()) {
      errors.supplier_code = 'Supplier code is required.';
    } else {
      const isDuplicate = suppliers.some(
        (s) => s.supplier_code.toLowerCase() === formData.supplier_code.trim().toLowerCase() &&
               (!editingSupplier || s.id !== editingSupplier.id)
      );
      if (isDuplicate) {
        errors.supplier_code = 'Supplier code must be unique.';
      }
    }

    if (!formData.name.trim()) {
      errors.name = 'Company / Vendor name is required.';
    }

    if (!formData.phone.trim()) {
      errors.phone = 'Contact phone number is required.';
    }

    if (!formData.address.trim()) {
      errors.address = 'Primary business address is required.';
    }

    if (formData.email.trim() && !/^\S+@\S+\.\S+$/.test(formData.email.trim())) {
      errors.email = 'Please provide a valid email address.';
    }

    if (formData.lead_time_days < 0) {
      errors.lead_time_days = 'Lead time cannot be negative.';
    }

    if (formData.payment_terms_days < 0) {
      errors.payment_terms_days = 'Payment terms cannot be negative.';
    }

    if (formData.rating < 0 || formData.rating > 5) {
      errors.rating = 'Rating must be between 0.0 and 5.0.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle Save (Create or Update)
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      if (editingSupplier) {
        // Update existing
        await dbService.execute(
          `UPDATE suppliers 
           SET supplier_code = ?, name = ?, contact_person = ?, email = ?, phone = ?, 
               address = ?, city = ?, country = ?, tax_id = ?, payment_terms_days = ?, 
               lead_time_days = ?, rating = ?, notes = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?;`,
          [
            formData.supplier_code.trim().toUpperCase(),
            formData.name.trim(),
            formData.contact_person.trim() || null,
            formData.email.trim() || null,
            formData.phone.trim(),
            formData.address.trim(),
            formData.city.trim() || 'Dhaka',
            formData.country.trim() || 'Bangladesh',
            formData.tax_id.trim() || null,
            Number(formData.payment_terms_days),
            Number(formData.lead_time_days),
            Number(formData.rating),
            formData.notes.trim() || null,
            editingSupplier.id
          ]
        );
        showToast('success', `Supplier "${formData.name}" updated successfully.`);
      } else {
        // Create new
        const id = `sup-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const performanceScore = Number(formData.rating) * 20.0;
        await dbService.execute(
          `INSERT INTO suppliers (
            id, supplier_code, name, contact_person, email, phone, address, city, country,
            tax_id, payment_terms_days, lead_time_days, rating, performance_score,
            total_pos_issued, total_pos_fulfilled, notes, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 1);`,
          [
            id,
            formData.supplier_code.trim().toUpperCase(),
            formData.name.trim(),
            formData.contact_person.trim() || null,
            formData.email.trim() || null,
            formData.phone.trim(),
            formData.address.trim(),
            formData.city.trim() || 'Dhaka',
            formData.country.trim() || 'Bangladesh',
            formData.tax_id.trim() || null,
            Number(formData.payment_terms_days),
            Number(formData.lead_time_days),
            Number(formData.rating),
            performanceScore,
            formData.notes.trim() || null
          ]
        );
        showToast('success', `Supplier "${formData.name}" created successfully.`);
      }

      setIsFormModalOpen(false);
      await loadSuppliers();
    } catch (err: any) {
      console.error('Save supplier error:', err);
      showToast('error', `Failed to save supplier: ${err.message || String(err)}`);
    }
  };

  // Toggle Active/Inactive Status
  const handleToggleStatus = async (supplier: Supplier) => {
    try {
      const newStatus = supplier.is_active === 1 ? 0 : 1;
      await dbService.execute(
        `UPDATE suppliers 
         SET is_active = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ?;`,
        [newStatus, supplier.id]
      );
      showToast(
        'info',
        `Supplier "${supplier.name}" marked as ${newStatus === 1 ? 'Active' : 'Inactive'}.`
      );
      await loadSuppliers();
    } catch (err: any) {
      console.error('Toggle status error:', err);
      showToast('error', `Failed to change status: ${err.message || String(err)}`);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
            <Users className="text-[var(--accent-primary)]" size={26} />
            Vendors & Supplier Directory
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Manage strategic suppliers, track fulfillment lead times, and monitor performance scorecards.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSuppliers}
            disabled={isLoading}
            className="btn btn-secondary"
            title="Reload suppliers from local database"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="btn btn-primary"
          >
            <UserPlus size={16} />
            <span>Add Supplier</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-all duration-200 ${
            notification.type === 'success'
              ? 'bg-[var(--emerald-bg)] border-[var(--emerald-border)] text-[var(--emerald)]'
              : notification.type === 'error'
              ? 'bg-[var(--ruby-bg)] border-[var(--ruby-border)] text-[var(--ruby)]'
              : 'bg-[var(--cyan-bg)] border-[var(--cyan-border)] text-[var(--cyan)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' && <CheckCircle2 size={16} />}
            {notification.type === 'error' && <AlertCircle size={16} />}
            {notification.type === 'info' && <ShieldCheck size={16} />}
            <span className="font-medium">{notification.text}</span>
          </div>
          <button onClick={() => setNotification(null)} className="opacity-75 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Suppliers */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Total Vendors</span>
            <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
              <Building2 size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {stats.totalSuppliers}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
              <span>Directory registry count</span>
            </div>
          </div>
        </div>

        {/* Active Partners */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Active Partners</span>
            <div className="p-2 rounded-lg bg-[var(--emerald-bg)] text-[var(--emerald)]">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {stats.activeSuppliers}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              {stats.totalSuppliers > 0
                ? `${Math.round((stats.activeSuppliers / stats.totalSuppliers) * 100)}% operational status`
                : 'No suppliers yet'}
            </div>
          </div>
        </div>

        {/* Average Delivery Lead Time */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Avg Delivery Lead</span>
            <div className="p-2 rounded-lg bg-[var(--amber-bg)] text-[var(--amber)]">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {stats.avgLeadTime} <span className="text-sm font-normal text-[var(--text-dim)]">Days</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Order issue to dock receipt target
            </div>
          </div>
        </div>

        {/* Top Performer */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Top Performer</span>
            <div className="p-2 rounded-lg bg-[var(--cyan-bg)] text-[var(--cyan)]">
              <Award size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-[var(--text-main)] truncate" title={stats.topRatedSupplier?.name}>
              {stats.topRatedSupplier ? stats.topRatedSupplier.name : 'N/A'}
            </div>
            <div className="text-xs text-[var(--emerald)] mt-1 font-semibold flex items-center gap-1">
              {stats.topRatedSupplier ? `${stats.topRatedSupplier.score.toFixed(1)}% Performance Index` : 'Awaiting orders'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="erp-card p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              type="text"
              placeholder="Search by vendor name, supplier code, contact person, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9 pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-main)]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-[var(--border-color)] p-0.5 bg-[var(--bg-primary)]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  statusFilter === 'all'
                    ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm font-semibold'
                    : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
                }`}
              >
                All ({suppliers.length})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  statusFilter === 'active'
                    ? 'bg-[var(--bg-card)] text-[var(--emerald)] shadow-sm font-semibold'
                    : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
                }`}
              >
                Active ({suppliers.filter((s) => s.is_active === 1).length})
              </button>
              <button
                onClick={() => setStatusFilter('inactive')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  statusFilter === 'inactive'
                    ? 'bg-[var(--bg-card)] text-[var(--ruby)] shadow-sm font-semibold'
                    : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
                }`}
              >
                Inactive ({suppliers.filter((s) => s.is_active === 0).length})
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 border border-[var(--border-color)] rounded-lg px-2 py-1 bg-[var(--bg-primary)]">
              <ArrowUpDown size={14} className="text-[var(--text-dim)]" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs text-[var(--text-main)] border-none outline-none cursor-pointer py-0.5"
              >
                <option value="rating">Rating / Performance</option>
                <option value="name">Company Name</option>
                <option value="lead_time">Lead Time</option>
                <option value="pos">Fulfilled POs</option>
              </select>
              <button
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="text-[var(--text-dim)] hover:text-[var(--text-main)] p-1"
                title={`Order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                <span className="text-xs font-bold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Suppliers Interactive Table */}
      <div className="erp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Supplier & Contact</th>
                <th>Contact Details</th>
                <th>Location</th>
                <th>Lead Time</th>
                <th>Performance Scorecard</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[var(--text-dim)]">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[var(--accent-primary)]" />
                    <span>Loading suppliers from local SQLite database...</span>
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[var(--text-dim)]">
                    <Users size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No suppliers match your filter criteria.</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Try resetting search or add a new supplier.</p>
                    {(searchQuery || statusFilter !== 'all') && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setStatusFilter('all');
                        }}
                        className="btn btn-secondary text-xs mt-3"
                      >
                        Clear Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((sup) => {
                  const score = sup.performance_score || (sup.rating * 20);
                  const isHighPerformance = score >= 90;
                  const isMediumPerformance = score >= 75 && score < 90;

                  return (
                    <tr key={sup.id} className="group">
                      {/* Code */}
                      <td>
                        <span className="chip-mono font-bold text-[var(--accent-primary)]">
                          {sup.supplier_code}
                        </span>
                      </td>

                      {/* Supplier & Contact */}
                      <td>
                        <div className="font-semibold text-[var(--text-main)] group-hover:text-[var(--accent-primary)] transition-colors">
                          {sup.name}
                        </div>
                        {sup.contact_person && (
                          <div className="text-xs text-[var(--text-dim)] flex items-center gap-1 mt-0.5">
                            <span>{sup.contact_person}</span>
                          </div>
                        )}
                      </td>

                      {/* Contact Details */}
                      <td>
                        <div className="space-y-1">
                          <div className="text-xs flex items-center gap-1.5 text-[var(--text-main)] font-mono">
                            <Phone size={12} className="text-[var(--text-dim)]" />
                            <span>{sup.phone}</span>
                          </div>
                          {sup.email && (
                            <div className="text-xs flex items-center gap-1.5 text-[var(--text-muted)]">
                              <Mail size={12} className="text-[var(--text-dim)]" />
                              <span className="truncate max-w-[180px]">{sup.email}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Location */}
                      <td>
                        <div className="text-xs text-[var(--text-main)] font-medium">
                          {sup.city || 'Dhaka'}
                        </div>
                        <div className="text-[11px] text-[var(--text-dim)]">
                          {sup.country || 'Bangladesh'}
                        </div>
                      </td>

                      {/* Lead Time */}
                      <td>
                        <div className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-color)]">
                          <Clock size={12} className="text-[var(--amber)]" />
                          <span>{sup.lead_time_days ?? 7} Days</span>
                        </div>
                        <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
                          Net {sup.payment_terms_days ?? 30} days
                        </div>
                      </td>

                      {/* Performance Scorecard */}
                      <td>
                        <div className="space-y-1 min-w-[130px]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-main)]">
                              <Star size={12} className="text-amber-400 fill-amber-400" />
                              {(sup.rating ?? 5.0).toFixed(1)}
                            </span>
                            <span
                              className={`text-[11px] font-bold ${
                                isHighPerformance
                                  ? 'text-[var(--emerald)]'
                                  : isMediumPerformance
                                  ? 'text-[var(--amber)]'
                                  : 'text-[var(--ruby)]'
                              }`}
                            >
                              {score.toFixed(0)}%
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isHighPerformance
                                  ? 'bg-[var(--emerald)]'
                                  : isMediumPerformance
                                  ? 'bg-[var(--amber)]'
                                  : 'bg-[var(--ruby)]'
                              }`}
                              style={{ width: `${Math.min(score, 100)}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-[var(--text-dim)] flex items-center justify-between">
                            <span>Fulfilled: {sup.total_pos_fulfilled ?? 0} POs</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        {sup.is_active === 1 ? (
                          <span className="badge badge-success">
                            <CheckCircle2 size={12} />
                            Active
                          </span>
                        ) : (
                          <span className="badge badge-danger">
                            <XCircle size={12} />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedScorecardSupplier(sup)}
                            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--accent-primary)] transition-colors"
                            title="View Performance Scorecard"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(sup)}
                            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
                            title="Edit Supplier Profile"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(sup)}
                            className={`p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors ${
                              sup.is_active === 1
                                ? 'text-[var(--text-dim)] hover:text-[var(--ruby)]'
                                : 'text-[var(--text-dim)] hover:text-[var(--emerald)]'
                            }`}
                            title={sup.is_active === 1 ? 'Deactivate Supplier' : 'Activate Supplier'}
                          >
                            {sup.is_active === 1 ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Create / Edit Supplier Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
                  {editingSupplier ? <Edit2 size={18} /> : <UserPlus size={18} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    {editingSupplier ? `Edit Supplier: ${editingSupplier.name}` : 'Register New Vendor / Supplier'}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {editingSupplier
                      ? 'Update contact credentials, commercial terms, and lead time defaults.'
                      : 'Add a new supplier to the local enterprise directory with performance targets.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveSupplier} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Row 1: Code and Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Supplier Code *
                  </label>
                  <input
                    type="text"
                    value={formData.supplier_code}
                    onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value.toUpperCase() })}
                    placeholder="SUP-TEX-001"
                    className={`input-field font-mono uppercase ${formErrors.supplier_code ? 'border-[var(--ruby)]' : ''}`}
                  />
                  {formErrors.supplier_code && (
                    <span className="text-[11px] text-[var(--ruby)] mt-1 block">{formErrors.supplier_code}</span>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Company / Vendor Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Bengal Textile & Weaving Mills Ltd."
                    className={`input-field ${formErrors.name ? 'border-[var(--ruby)]' : ''}`}
                  />
                  {formErrors.name && (
                    <span className="text-[11px] text-[var(--ruby)] mt-1 block">{formErrors.name}</span>
                  )}
                </div>
              </div>

              {/* Row 2: Contact Person and Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    placeholder="e.g. Md. Rafiqul Islam"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Contact Phone Number *
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+880 1711-200101"
                    className={`input-field font-mono ${formErrors.phone ? 'border-[var(--ruby)]' : ''}`}
                  />
                  {formErrors.phone && (
                    <span className="text-[11px] text-[var(--ruby)] mt-1 block">{formErrors.phone}</span>
                  )}
                </div>
              </div>

              {/* Row 3: Email and Tax ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Official Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="orders@bengaltextile.com"
                    className={`input-field ${formErrors.email ? 'border-[var(--ruby)]' : ''}`}
                  />
                  {formErrors.email && (
                    <span className="text-[11px] text-[var(--ruby)] mt-1 block">{formErrors.email}</span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Tax / BIN Number
                  </label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    placeholder="TIN-99482019-BGD"
                    className="input-field font-mono uppercase"
                  />
                </div>
              </div>

              {/* Row 4: Address, City, Country */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Factory / Office Address *
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Plot 12-14, Savar EPZ Industrial Zone"
                    className={`input-field ${formErrors.address ? 'border-[var(--ruby)]' : ''}`}
                  />
                  {formErrors.address && (
                    <span className="text-[11px] text-[var(--ruby)] mt-1 block">{formErrors.address}</span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    City & Country
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="City"
                      className="input-field w-1/2"
                    />
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      placeholder="Country"
                      className="input-field w-1/2"
                    />
                  </div>
                </div>
              </div>

              {/* Row 5: Commercial Parameters & Rating */}
              <div className="p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] space-y-3">
                <div className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                  Commercial & Performance Parameters
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                      Lead Time (Days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formData.lead_time_days}
                      onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 0 })}
                      className="input-field font-mono"
                    />
                    <span className="text-[10px] text-[var(--text-dim)]">Order to dock turnaround</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                      Payment Terms (Days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formData.payment_terms_days}
                      onChange={(e) => setFormData({ ...formData, payment_terms_days: parseInt(e.target.value) || 0 })}
                      className="input-field font-mono"
                    />
                    <span className="text-[10px] text-[var(--text-dim)]">Net invoice credit window</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                      Initial Quality Rating (0 - 5.0)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={5}
                      value={formData.rating}
                      onChange={(e) => setFormData({ ...formData, rating: parseFloat(e.target.value) || 0 })}
                      className="input-field font-mono"
                    />
                    <span className="text-[10px] text-[var(--text-dim)]">Baseline QA star rating</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Notes / Operating Agreements
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Special supplier terms, bulk volume tier discounts, or delivery dock preferences..."
                  className="input-field"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} />
                  <span>{editingSupplier ? 'Update Supplier' : 'Register Supplier'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Supplier Performance Scorecard Modal */}
      {selectedScorecardSupplier && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden">
            {/* Scorecard Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2">
                <Award className="text-[var(--accent-primary)]" size={20} />
                <h3 className="text-base font-bold text-[var(--text-main)]">
                  Supplier Performance Scorecard
                </h3>
              </div>
              <button
                onClick={() => setSelectedScorecardSupplier(null)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scorecard Content */}
            <div className="p-6 space-y-5">
              {/* Profile Overview */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="chip-mono font-bold text-xs">
                    {selectedScorecardSupplier.supplier_code}
                  </span>
                  <h2 className="text-lg font-bold text-[var(--text-main)] mt-1">
                    {selectedScorecardSupplier.name}
                  </h2>
                  <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                    <MapPin size={12} className="text-[var(--text-dim)]" />
                    <span>{selectedScorecardSupplier.address}, {selectedScorecardSupplier.city}, {selectedScorecardSupplier.country}</span>
                  </div>
                </div>

                <div>
                  {selectedScorecardSupplier.is_active === 1 ? (
                    <span className="badge badge-success">Active Partner</span>
                  ) : (
                    <span className="badge badge-danger">Inactive</span>
                  )}
                </div>
              </div>

              {/* KPI Score Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-center">
                  <div className="text-[11px] font-semibold text-[var(--text-dim)] uppercase">Quality Rating</div>
                  <div className="text-xl font-bold font-mono text-amber-500 flex items-center justify-center gap-1 mt-1">
                    <Star size={18} className="fill-amber-400" />
                    {(selectedScorecardSupplier.rating ?? 5.0).toFixed(1)}
                  </div>
                  <div className="text-[10px] text-[var(--text-dim)] mt-0.5">Out of 5.0 scale</div>
                </div>

                <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-center">
                  <div className="text-[11px] font-semibold text-[var(--text-dim)] uppercase">Fulfillment %</div>
                  <div className="text-xl font-bold font-mono text-[var(--emerald)] mt-1">
                    {(selectedScorecardSupplier.performance_score || selectedScorecardSupplier.rating * 20).toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-[var(--text-dim)] mt-0.5">On-time SLA index</div>
                </div>

                <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-center">
                  <div className="text-[11px] font-semibold text-[var(--text-dim)] uppercase">Target Lead</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-main)] mt-1">
                    {selectedScorecardSupplier.lead_time_days ?? 7} <span className="text-xs font-normal">Days</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-dim)] mt-0.5">Net {selectedScorecardSupplier.payment_terms_days ?? 30} credit</div>
                </div>
              </div>

              {/* Purchase History Metrics */}
              <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] space-y-2.5">
                <div className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center justify-between">
                  <span>Procurement Lifetime Volumes</span>
                  <span className="text-[var(--text-dim)] font-mono text-[11px]">Audit Verified</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[var(--text-dim)]">Total Purchase Orders Issued:</span>
                    <div className="font-bold font-mono text-sm text-[var(--text-main)] mt-0.5">
                      {selectedScorecardSupplier.total_pos_issued ?? 0} Orders
                    </div>
                  </div>
                  <div>
                    <span className="text-[var(--text-dim)]">Fully Received & Fulfilled:</span>
                    <div className="font-bold font-mono text-sm text-[var(--emerald)] mt-0.5">
                      {selectedScorecardSupplier.total_pos_fulfilled ?? 0} Orders
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Profile Summary */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
                  <span className="text-[var(--text-dim)]">Key Account Manager:</span>
                  <span className="font-semibold text-[var(--text-main)]">{selectedScorecardSupplier.contact_person || 'Not specified'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
                  <span className="text-[var(--text-dim)]">Phone:</span>
                  <span className="font-mono text-[var(--text-main)]">{selectedScorecardSupplier.phone}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
                  <span className="text-[var(--text-dim)]">Email:</span>
                  <span className="text-[var(--text-main)]">{selectedScorecardSupplier.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
                  <span className="text-[var(--text-dim)]">Tax ID / TIN:</span>
                  <span className="font-mono uppercase text-[var(--text-main)]">{selectedScorecardSupplier.tax_id || 'N/A'}</span>
                </div>
              </div>

              {selectedScorecardSupplier.notes && (
                <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-muted)]">
                  <div className="font-semibold text-[var(--text-main)] mb-0.5">Operating Notes:</div>
                  <p>{selectedScorecardSupplier.notes}</p>
                </div>
              )}
            </div>

            {/* Scorecard Footer */}
            <div className="flex items-center justify-end px-6 py-3.5 border-t border-[var(--border-color)] bg-[var(--bg-primary)]">
              <button
                onClick={() => setSelectedScorecardSupplier(null)}
                className="btn btn-secondary"
              >
                Close Scorecard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuppliersView;
