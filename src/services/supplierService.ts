// ============================================================================
// PROBAHO ERP: VENDOR & SUPPLIER MANAGEMENT SERVICE
// Proposed File: src/services/supplierService.ts
// Milestone: M2 - Suppliers & Procurement Core Domain
// ============================================================================

import { dbService, type IDatabaseService } from './db';
import type { Supplier, CreateSupplierInput } from '../types/erp';

export interface SupplierFilterOptions {
  activeOnly?: boolean;
  search?: string;
  sortBy?: 'name' | 'rating' | 'lead_time_days' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface UpdateSupplierInput {
  supplierCode?: string;
  name?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
  paymentTermsDays?: number;
  leadTimeDays?: number;
  rating?: number;
  performanceScore?: number;
  totalPosIssued?: number;
  totalPosFulfilled?: number;
  notes?: string;
  isActive?: boolean;
}

export interface SupplierStats {
  totalPosIssued: number;
  totalPosFulfilled: number;
  fulfillmentRate: number;
  activePosCount: number;
  totalSpend: number;
}

export class SupplierService {
  private static instance: SupplierService | null = null;

  public static getInstance(): SupplierService {
    if (!SupplierService.instance) {
      SupplierService.instance = new SupplierService();
    }
    return SupplierService.instance;
  }

  /**
   * Retrieves all suppliers with optional filtering by active status, keyword search, and sorting.
   */
  public async getAllSuppliers(
    options: SupplierFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<Supplier[]> {
    const db = targetDb || dbService;
    let sql = 'SELECT * FROM suppliers';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.activeOnly) {
      conditions.push('is_active = 1');
    }

    if (options.search && options.search.trim()) {
      const searchTerm = `%${options.search.trim()}%`;
      conditions.push(
        '(name LIKE ? OR supplier_code LIKE ? OR contact_person LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?)'
      );
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortBy = options.sortBy || 'name';
    const sortOrder = options.sortOrder || 'ASC';
    sql += ` ORDER BY ${sortBy} ${sortOrder}`;

    if (options.limit !== undefined && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset !== undefined && options.offset >= 0) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    return db.query<Supplier>(sql, params);
  }

  /**
   * Retrieves a single supplier by internal UUID/primary key.
   */
  public async getSupplierById(id: string, targetDb?: IDatabaseService): Promise<Supplier | null> {
    const db = targetDb || dbService;
    const rows = await db.query<Supplier>('SELECT * FROM suppliers WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Retrieves a single supplier by unique business code (e.g. SUP-001).
   */
  public async getSupplierByCode(code: string, targetDb?: IDatabaseService): Promise<Supplier | null> {
    const db = targetDb || dbService;
    const rows = await db.query<Supplier>('SELECT * FROM suppliers WHERE supplier_code = ?', [code]);
    return rows[0] || null;
  }

  /**
   * Registers a new supplier in the system with comprehensive profile and defaults.
   */
  public async createSupplier(
    input: CreateSupplierInput,
    targetDb?: IDatabaseService
  ): Promise<Supplier> {
    const db = targetDb || dbService;

    // 1. Mandatory field validation
    if (!input.supplierCode || !input.supplierCode.trim()) {
      throw new Error('Supplier code is mandatory.');
    }
    if (!input.name || !input.name.trim()) {
      throw new Error('Supplier name is mandatory.');
    }
    if (!input.phone || !input.phone.trim()) {
      throw new Error('Supplier phone number is mandatory.');
    }
    if (!input.address || !input.address.trim()) {
      throw new Error('Supplier address is mandatory.');
    }

    // 2. Range & numeric constraint validation
    const paymentTerms = input.paymentTermsDays ?? 30;
    if (paymentTerms < 0) {
      throw new Error('Payment terms days cannot be negative.');
    }

    const leadTime = input.leadTimeDays ?? 7;
    if (leadTime < 0) {
      throw new Error('Lead time days cannot be negative.');
    }

    const rating = input.rating ?? 5.0;
    if (rating < 0.0 || rating > 5.0) {
      throw new Error('Supplier rating must be between 0.0 and 5.0.');
    }

    const id = input.id || `sup-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // 3. Execution
    await db.execute(
      `INSERT INTO suppliers (
        id, supplier_code, name, contact_person, phone, email, address, city, country, tax_id,
        payment_terms_days, lead_time_days, rating, performance_score, total_pos_issued, total_pos_fulfilled,
        notes, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100.0, 0, 0, ?, 1)`,
      [
        id,
        input.supplierCode.trim(),
        input.name.trim(),
        input.contactPerson?.trim() || null,
        input.phone.trim(),
        input.email?.trim() || null,
        input.address.trim(),
        input.city?.trim() || 'Dhaka',
        input.country?.trim() || 'Bangladesh',
        input.taxId?.trim() || null,
        paymentTerms,
        leadTime,
        rating,
        input.notes?.trim() || null
      ]
    );

    const created = await this.getSupplierById(id, db);
    if (!created) {
      throw new Error(`Failed to retrieve newly created supplier with ID ${id}`);
    }
    return created;
  }

  /**
   * Updates an existing supplier record with partial data.
   */
  public async updateSupplier(
    id: string,
    input: UpdateSupplierInput,
    targetDb?: IDatabaseService
  ): Promise<Supplier> {
    const db = targetDb || dbService;
    const existing = await this.getSupplierById(id, db);
    if (!existing) {
      throw new Error(`Supplier with ID ${id} not found.`);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (input.supplierCode !== undefined) {
      if (!input.supplierCode.trim()) throw new Error('Supplier code cannot be empty.');
      updates.push('supplier_code = ?');
      params.push(input.supplierCode.trim());
    }

    if (input.name !== undefined) {
      if (!input.name.trim()) throw new Error('Supplier name cannot be empty.');
      updates.push('name = ?');
      params.push(input.name.trim());
    }

    if (input.contactPerson !== undefined) {
      updates.push('contact_person = ?');
      params.push(input.contactPerson ? input.contactPerson.trim() : null);
    }

    if (input.email !== undefined) {
      updates.push('email = ?');
      params.push(input.email ? input.email.trim() : null);
    }

    if (input.phone !== undefined) {
      if (!input.phone.trim()) throw new Error('Phone cannot be empty.');
      updates.push('phone = ?');
      params.push(input.phone.trim());
    }

    if (input.address !== undefined) {
      if (!input.address.trim()) throw new Error('Address cannot be empty.');
      updates.push('address = ?');
      params.push(input.address.trim());
    }

    if (input.city !== undefined) {
      updates.push('city = ?');
      params.push(input.city ? input.city.trim() : null);
    }

    if (input.country !== undefined) {
      updates.push('country = ?');
      params.push(input.country ? input.country.trim() : 'Bangladesh');
    }

    if (input.taxId !== undefined) {
      updates.push('tax_id = ?');
      params.push(input.taxId ? input.taxId.trim() : null);
    }

    if (input.paymentTermsDays !== undefined) {
      if (input.paymentTermsDays < 0) throw new Error('Payment terms days cannot be negative.');
      updates.push('payment_terms_days = ?');
      params.push(input.paymentTermsDays);
    }

    if (input.leadTimeDays !== undefined) {
      if (input.leadTimeDays < 0) throw new Error('Lead time days cannot be negative.');
      updates.push('lead_time_days = ?');
      params.push(input.leadTimeDays);
    }

    if (input.rating !== undefined) {
      if (input.rating < 0.0 || input.rating > 5.0) {
        throw new Error('Rating must be between 0.0 and 5.0.');
      }
      updates.push('rating = ?');
      params.push(input.rating);
    }

    if (input.performanceScore !== undefined) {
      if (input.performanceScore < 0.0 || input.performanceScore > 100.0) {
        throw new Error('Performance score must be between 0.0 and 100.0.');
      }
      updates.push('performance_score = ?');
      params.push(input.performanceScore);
    }

    if (input.totalPosIssued !== undefined) {
      if (input.totalPosIssued < 0) throw new Error('Total POs issued cannot be negative.');
      updates.push('total_pos_issued = ?');
      params.push(input.totalPosIssued);
    }

    if (input.totalPosFulfilled !== undefined) {
      if (input.totalPosFulfilled < 0) throw new Error('Total POs fulfilled cannot be negative.');
      updates.push('total_pos_fulfilled = ?');
      params.push(input.totalPosFulfilled);
    }

    if (input.notes !== undefined) {
      updates.push('notes = ?');
      params.push(input.notes ? input.notes.trim() : null);
    }

    if (input.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(input.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push("updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
    params.push(id);

    const sql = `UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`;
    await db.execute(sql, params);

    const updated = await this.getSupplierById(id, db);
    return updated!;
  }

  /**
   * Updates supplier performance metrics: star rating (0-5), average lead time, and optional score (0-100).
   */
  public async updateSupplierPerformance(
    id: string,
    rating: number,
    leadTimeDays?: number,
    performanceScore?: number,
    targetDb?: IDatabaseService
  ): Promise<Supplier> {
    if (rating < 0.0 || rating > 5.0) {
      throw new Error('Supplier rating must be between 0.0 and 5.0.');
    }
    if (leadTimeDays !== undefined && leadTimeDays < 0) {
      throw new Error('Lead time days cannot be negative.');
    }
    if (performanceScore !== undefined && (performanceScore < 0.0 || performanceScore > 100.0)) {
      throw new Error('Performance score must be between 0.0 and 100.0.');
    }

    return this.updateSupplier(
      id,
      {
        rating,
        leadTimeDays,
        performanceScore
      },
      targetDb
    );
  }

  /**
   * Toggles active / suspended status for a supplier.
   */
  public async setSupplierStatus(
    id: string,
    isActive: boolean,
    targetDb?: IDatabaseService
  ): Promise<Supplier> {
    return this.updateSupplier(id, { isActive }, targetDb);
  }

  /**
   * Deletes a supplier record. If purchase orders or batches reference this supplier,
   * performs a safe soft-delete (is_active = 0) unless force is specified, preserving relational integrity.
   */
  public async deleteSupplier(
    id: string,
    options: { force?: boolean } = {},
    targetDb?: IDatabaseService
  ): Promise<{ success: boolean; softDeleted: boolean }> {
    const db = targetDb || dbService;
    const existing = await this.getSupplierById(id, db);
    if (!existing) {
      throw new Error(`Supplier with ID ${id} not found.`);
    }

    // Check for foreign key references
    const poCountRes = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ?',
      [id]
    );
    const hasPOs = Number(poCountRes[0]?.count || 0) > 0;

    const batchCountRes = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM item_batches WHERE supplier_id = ?',
      [id]
    );
    const hasBatches = Number(batchCountRes[0]?.count || 0) > 0;

    if (hasPOs || hasBatches) {
      if (!options.force) {
        // Soft delete
        await this.setSupplierStatus(id, false, db);
        return { success: true, softDeleted: true };
      } else {
        throw new Error(
          `Cannot hard delete supplier ${id}: existing purchase orders or batches reference this record. The supplier has been deactivated.`
        );
      }
    }

    // Safe to hard delete
    await db.execute('DELETE FROM suppliers WHERE id = ?', [id]);
    return { success: true, softDeleted: false };
  }

  /**
   * Computes real-time performance summary and purchase statistics for a supplier.
   */
  public async getSupplierStats(id: string, targetDb?: IDatabaseService): Promise<SupplierStats> {
    const db = targetDb || dbService;
    const supplier = await this.getSupplierById(id, db);
    if (!supplier) {
      throw new Error(`Supplier with ID ${id} not found.`);
    }

    const poAggRes = await db.query<{
      totalPos: number;
      fulfilledPos: number;
      activePos: number;
      totalSpend: number;
    }>(
      `SELECT 
        COUNT(*) as totalPos,
        SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as fulfilledPos,
        SUM(CASE WHEN status IN ('draft', 'pending_approval', 'approved', 'ordered', 'partially_received') THEN 1 ELSE 0 END) as activePos,
        SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END) as totalSpend
      FROM purchase_orders 
      WHERE supplier_id = ?`,
      [id]
    );

    const agg = poAggRes[0];
    const totalPos = Number(agg?.totalPos || supplier.total_pos_issued || 0);
    const fulfilledPos = Number(agg?.fulfilledPos || supplier.total_pos_fulfilled || 0);
    const activePos = Number(agg?.activePos || 0);
    const totalSpend = Number(agg?.totalSpend || 0);
    const fulfillmentRate = totalPos > 0 ? Math.round((fulfilledPos / totalPos) * 1000) / 10 : 100.0;

    return {
      totalPosIssued: totalPos,
      totalPosFulfilled: fulfilledPos,
      fulfillmentRate,
      activePosCount: activePos,
      totalSpend
    };
  }
}

export const supplierService = SupplierService.getInstance();
