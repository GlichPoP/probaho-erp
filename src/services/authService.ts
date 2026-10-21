// ============================================================================
// PROBAHO ERP: ROLE-BASED AUTHENTICATION & SECURITY SERVICE
// File: src/services/authService.ts
// Features: Master ID Onboarding, Staff ID Delegation, Granular Tab RBAC
// ============================================================================

import { dbService } from './db';
import { validateMasterPassword, validateStaffPassword, hashSecret } from '../utils/security';

export type UserRole = 'master' | 'employee' | 'manager' | 'cashier' | 'warehouse_staff' | 'logistics';

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  email_or_phone?: string;
  role: UserRole;
  password_hash?: string;
  pin_code?: string;
  designation?: string;
  allowed_tabs: string[];
  is_active: boolean;
  created_by?: string;
  created_at: string;
  last_active_at?: string;
}

export const ALL_ERP_MODULE_TABS: Array<{ id: string; label: string; description: string }> = [
  { id: 'dashboard', label: 'Dashboard & Analytics', description: 'Real-time KPIs, turnover, and asset valuations' },
  { id: 'showroom', label: 'Showroom & POS Counter', description: 'Point of sale, barcode scanning & retail checkout' },
  { id: 'inventory', label: 'Inventory & Stock Control', description: 'Multi-bin tracking, lot batches & valuation' },
  { id: 'warehouses', label: 'Warehouses & Facilities', description: 'Facility configuration, bin matrix & capacity' },
  { id: 'transfers', label: 'Inter-Warehouse Transfers', description: 'Transit dispatches, receiving & discrepancy logs' },
  { id: 'suppliers', label: 'Suppliers & Vendors', description: 'Vendor directory, ratings & lead times' },
  { id: 'procurement', label: 'Purchase Orders & GRN', description: 'Procurement orders & goods receipt inspection' },
  { id: 'logistics', label: 'Fulfillment & Logistics', description: 'Outbound dispatch, carrier tracking & RTO returns' },
  { id: 'settings', label: 'System Settings & Staff', description: 'Master settings, user access, and backups' }
];

export const ROLE_PRESET_TABS: Record<UserRole, string[]> = {
  master: ['dashboard', 'showroom', 'inventory', 'warehouses', 'transfers', 'suppliers', 'procurement', 'logistics', 'settings'],
  manager: ['dashboard', 'showroom', 'inventory', 'warehouses', 'transfers', 'suppliers', 'procurement', 'logistics'],
  cashier: ['dashboard', 'showroom', 'inventory'],
  warehouse_staff: ['inventory', 'warehouses', 'transfers', 'procurement'],
  logistics: ['logistics', 'transfers', 'inventory'],
  employee: ['dashboard', 'showroom', 'inventory']
};

export const GUEST_USER: UserAccount = {
  id: 'usr-guest-preview',
  name: 'Guest Explorer',
  username: 'guest',
  role: 'employee',
  designation: 'Guest Previewer',
  allowed_tabs: ['dashboard', 'showroom', 'suppliers', 'procurement', 'inventory', 'warehouses', 'transfers', 'logistics', 'settings'],
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z'
};

const SESSION_USER_KEY = 'PROBAHO_AUTH_SESSION_USER_ID';
const SESSION_KEEP_LOGGED_IN_KEY = 'PROBAHO_KEEP_LOGGED_IN';

class AuthService {
  private static instance: AuthService | null = null;
  private currentUser: UserAccount | null = null;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Checks whether the root Master Administrator account has been initialized.
   */
  public async isMasterConfigured(): Promise<boolean> {
    try {
      await dbService.initialize();
      const rows = await dbService.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM user_accounts WHERE role = 'master' AND is_active = 1;"
      );
      if (rows && rows[0] && rows[0].count > 0) {
        return true;
      }

      // Check system_settings flag as fallback
      const setting = await dbService.query<{ value: string }>(
        "SELECT value FROM system_settings WHERE key = 'is_master_configured';"
      );
      return setting.length > 0 && setting[0].value === 'true';
    } catch (err) {
      console.warn('[AuthService] Could not check master configuration status:', err);
      return false;
    }
  }

  /**
   * Returns a copy of the default guest user profile for instant exploration.
   */
  public getGuestUser(): UserAccount {
    return { ...GUEST_USER };
  }

  /**
   * Checks whether a user account represents an active guest preview session.
   */
  public isGuest(user: UserAccount | null | undefined): boolean {
    if (!user) return false;
    return user.id === GUEST_USER.id || user.username === 'guest';
  }

  /**
   * Initializes the root Master Administrator account.
   */
  public async initializeMasterAccount(params: {
    username: string;
    name: string;
    password: string;
    pinCode?: string;
    companyName?: string;
    emailOrPhone?: string;
  }): Promise<{ success: boolean; user?: UserAccount; message: string }> {
    try {
      await dbService.initialize();

      const cleanUsername = params.username.trim().toLowerCase();
      const cleanName = params.name.trim();

      if (cleanUsername.length < 3) {
        return { success: false, message: 'Master Username must be at least 3 characters long.' };
      }

      if (cleanName.length < 2) {
        return { success: false, message: 'Please enter Master Administrator Full Name.' };
      }

      const pwVal = validateMasterPassword(params.password);
      if (!pwVal.isValid) {
        return { success: false, message: pwVal.errors[0] || 'Password does not meet Master security requirements.' };
      }

      const passwordHash = await hashSecret(params.password);
      const pinCode = params.pinCode?.trim() || '1234';
      const masterId = 'usr-master-001';
      const now = new Date().toISOString();

      const allTabsJson = JSON.stringify(ROLE_PRESET_TABS.master);

      // Check if a master already exists
      const existing = await dbService.query<{ id: string }>(
        "SELECT id FROM user_accounts WHERE username = ? OR role = 'master';",
        [cleanUsername]
      );

      if (existing.length > 0) {
        // Update existing master
        await dbService.execute(
          `UPDATE user_accounts 
           SET name = ?, username = ?, email_or_phone = ?, password_hash = ?, pin_code = ?, 
               role = 'master', allowed_tabs = ?, is_active = 1, last_active_at = ?
           WHERE id = ?;`,
          [cleanName, cleanUsername, params.emailOrPhone || null, passwordHash, pinCode, allTabsJson, now, existing[0].id]
        );
      } else {
        // Insert new master
        await dbService.execute(
          `INSERT INTO user_accounts (id, name, username, email_or_phone, role, password_hash, pin_code, designation, allowed_tabs, is_active, created_by, created_at, last_active_at)
           VALUES (?, ?, ?, ?, 'master', ?, ?, 'Master Administrator', ?, 1, 'system', ?, ?);`,
          [masterId, cleanName, cleanUsername, params.emailOrPhone || null, passwordHash, pinCode, allTabsJson, now, now]
        );
      }

      // Update company name if provided
      if (params.companyName && params.companyName.trim()) {
        await dbService.execute(
          "INSERT OR REPLACE INTO system_settings (key, value, category, description) VALUES ('company_name', ?, 'company', 'Registered company name');",
          [params.companyName.trim()]
        );
      }

      await dbService.execute(
        "INSERT OR REPLACE INTO system_settings (key, value, category, description) VALUES ('is_master_configured', 'true', 'security', 'Master admin configured flag');"
      );

      // Audit Log
      await dbService.execute(
        "INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, 'INITIALIZE_MASTER', 'user_account', ?, ?);",
        [`aud-${Date.now()}`, cleanUsername, masterId, `Root Master Administrator established for ${cleanName} (@${cleanUsername})`]
      );

      await dbService.flush();

      const user: UserAccount = {
        id: existing[0]?.id || masterId,
        name: cleanName,
        username: cleanUsername,
        email_or_phone: params.emailOrPhone || undefined,
        role: 'master',
        designation: 'Master Administrator',
        allowed_tabs: ROLE_PRESET_TABS.master,
        is_active: true,
        created_at: now,
        last_active_at: now
      };

      this.setCurrentUser(user);

      return {
        success: true,
        user,
        message: 'Master Administrator account established successfully!'
      };
    } catch (err: any) {
      console.error('[AuthService] Error initializing master account:', err);
      return { success: false, message: `Failed to initialize Master account: ${err.message || String(err)}` };
    }
  }

  /**
   * Authenticates a user (Master Admin or Staff) using username/ID and password/PIN.
   */
  public async authenticate(
    identifier: string,
    secret: string
  ): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
    try {
      await dbService.initialize();

      const cleanId = (identifier || '').trim().toLowerCase();
      const cleanSecret = (secret || '').trim();

      // Guest mode instant bypass
      if (cleanId === 'guest') {
        const guest = this.getGuestUser();
        this.setCurrentUser(guest, false);
        return { success: true, user: guest, message: 'Welcome to Probaho ERP Guest Preview.' };
      }

      if (!cleanId || !cleanSecret) {
        return { success: false, message: 'Please enter both Username/ID and Password/PIN.' };
      }

      const rows = await dbService.query<any>(
        "SELECT * FROM user_accounts WHERE LOWER(username) = ? OR LOWER(email_or_phone) = ?;",
        [cleanId, cleanId]
      );

      if (!rows || rows.length === 0) {
        return { success: false, message: 'User account not found. Please verify your Username or Staff ID.' };
      }

      const row = rows[0];

      if (Number(row.is_active) === 0) {
        return {
          success: false,
          message: 'This account has been deactivated by the Master Administrator. Access revoked.'
        };
      }

      const secretHash = await hashSecret(cleanSecret);
      const isPasswordMatch = row.password_hash && row.password_hash === secretHash;
      const isPinMatch = row.pin_code && (row.pin_code === cleanSecret || row.pin_code === secretHash);
      const isPlainPasswordMatch = row.password_hash && row.password_hash === cleanSecret;

      // Master fallback for initial configuration if password was not yet hashed
      const isMasterInitialFallback =
        row.role === 'master' &&
        (!row.password_hash || row.password_hash === '') &&
        (cleanSecret === 'admin123' || cleanSecret === 'admin' || cleanSecret === '1234');

      if (!isPasswordMatch && !isPinMatch && !isPlainPasswordMatch && !isMasterInitialFallback) {
        return { success: false, message: 'Invalid password or PIN. Please try again.' };
      }

      const now = new Date().toISOString();
      await dbService.execute(
        "UPDATE user_accounts SET last_active_at = ? WHERE id = ?;",
        [now, row.id]
      );

      let allowedTabs: string[] = [];
      try {
        allowedTabs = typeof row.allowed_tabs === 'string' ? JSON.parse(row.allowed_tabs) : row.allowed_tabs;
      } catch {
        allowedTabs = ROLE_PRESET_TABS[row.role as UserRole] || ROLE_PRESET_TABS.employee;
      }

      const user: UserAccount = {
        id: row.id,
        name: row.name,
        username: row.username,
        email_or_phone: row.email_or_phone || undefined,
        role: row.role as UserRole,
        designation: row.designation || undefined,
        allowed_tabs: allowedTabs,
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        last_active_at: now
      };

      this.setCurrentUser(user);

      return { success: true, user, message: 'Authentication successful.' };
    } catch (err: any) {
      console.error('[AuthService] Authentication error:', err);
      return { success: false, message: `Login error: ${err.message || String(err)}` };
    }
  }

  /**
   * Retrieves all registered user accounts (Master + Employees).
   */
  public async getAllUsers(): Promise<UserAccount[]> {
    try {
      await dbService.initialize();
      const rows = await dbService.query<any>(
        "SELECT * FROM user_accounts ORDER BY CASE WHEN role = 'master' THEN 0 ELSE 1 END, name ASC;"
      );
      return rows.map((r: any) => {
        let allowedTabs: string[] = [];
        try {
          allowedTabs = typeof r.allowed_tabs === 'string' ? JSON.parse(r.allowed_tabs) : r.allowed_tabs;
        } catch {
          allowedTabs = ROLE_PRESET_TABS[r.role as UserRole] || ROLE_PRESET_TABS.employee;
        }
        return {
          id: r.id,
          name: r.name,
          username: r.username,
          email_or_phone: r.email_or_phone || undefined,
          role: r.role as UserRole,
          designation: r.designation || undefined,
          allowed_tabs: allowedTabs,
          is_active: Number(r.is_active) === 1,
          created_by: r.created_by || undefined,
          created_at: r.created_at,
          last_active_at: r.last_active_at || undefined,
          pin_code: r.pin_code || undefined
        };
      });
    } catch (err) {
      console.warn('[AuthService] Could not retrieve users:', err);
      return [];
    }
  }

  /**
   * Creates a new staff or employee account under the Master ID.
   */
  public async createStaffAccount(params: {
    name: string;
    username: string;
    emailOrPhone?: string;
    role: UserRole;
    designation?: string;
    passwordOrPin: string;
    allowedTabs?: string[];
    createdBy?: string;
  }): Promise<{ success: boolean; user?: UserAccount; message: string }> {
    try {
      await dbService.initialize();

      const cleanName = params.name.trim();
      const cleanUsername = params.username.trim().toLowerCase();

      if (cleanName.length < 2) {
        return { success: false, message: 'Please enter Employee Full Name.' };
      }
      if (cleanUsername.length < 3) {
        return { success: false, message: 'Employee Login ID must be at least 3 characters long.' };
      }

      const val = validateStaffPassword(params.passwordOrPin);
      if (!val.isValid) {
        return { success: false, message: val.message || 'Staff password/PIN must be at least 4 characters.' };
      }

      // Check username uniqueness
      const existing = await dbService.query<{ id: string }>(
        "SELECT id FROM user_accounts WHERE LOWER(username) = ?;",
        [cleanUsername]
      );
      if (existing.length > 0) {
        return { success: false, message: `Login ID "@${cleanUsername}" is already assigned to another employee.` };
      }

      const id = `usr-emp-${Date.now()}`;
      const now = new Date().toISOString();
      const passwordHash = await hashSecret(params.passwordOrPin);
      const pinCode = params.passwordOrPin.trim();

      const tabs = params.allowedTabs && params.allowedTabs.length > 0
        ? params.allowedTabs
        : ROLE_PRESET_TABS[params.role] || ROLE_PRESET_TABS.employee;

      await dbService.execute(
        `INSERT INTO user_accounts (id, name, username, email_or_phone, role, password_hash, pin_code, designation, allowed_tabs, is_active, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?);`,
        [id, cleanName, cleanUsername, params.emailOrPhone || null, params.role, passwordHash, pinCode, params.designation || null, JSON.stringify(tabs), params.createdBy || 'master', now]
      );

      // Audit Log
      await dbService.execute(
        "INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, 'CREATE_STAFF_ACCOUNT', 'user_account', ?, ?);",
        [`aud-${Date.now()}`, params.createdBy || 'master', id, `Created employee ID [@${cleanUsername}] with role ${params.role}`]
      );

      await dbService.flush();

      const newUser: UserAccount = {
        id,
        name: cleanName,
        username: cleanUsername,
        email_or_phone: params.emailOrPhone,
        role: params.role,
        designation: params.designation,
        allowed_tabs: tabs,
        is_active: true,
        created_by: params.createdBy || 'master',
        created_at: now
      };

      return { success: true, user: newUser, message: `Staff account created for ${cleanName}!` };
    } catch (err: any) {
      console.error('[AuthService] Error creating staff account:', err);
      return { success: false, message: `Failed to create staff account: ${err.message || String(err)}` };
    }
  }

  /**
   * Updates an existing employee or staff account.
   */
  public async updateStaffAccount(
    id: string,
    updates: {
      name?: string;
      emailOrPhone?: string;
      role?: UserRole;
      designation?: string;
      passwordOrPin?: string;
      allowedTabs?: string[];
      isActive?: boolean;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      await dbService.initialize();

      const users = await dbService.query<any>("SELECT * FROM user_accounts WHERE id = ?;", [id]);
      if (!users || users.length === 0) {
        return { success: false, message: 'User account not found.' };
      }

      const existing = users[0];
      const newName = updates.name !== undefined ? updates.name.trim() : existing.name;
      const newEmail = updates.emailOrPhone !== undefined ? updates.emailOrPhone : existing.email_or_phone;
      const newRole = updates.role !== undefined ? updates.role : existing.role;
      const newDesignation = updates.designation !== undefined ? updates.designation : existing.designation;
      const newIsActive = updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : existing.is_active;

      let newPasswordHash = existing.password_hash;
      let newPin = existing.pin_code;
      if (updates.passwordOrPin && updates.passwordOrPin.trim()) {
        newPasswordHash = await hashSecret(updates.passwordOrPin.trim());
        newPin = updates.passwordOrPin.trim();
      }

      let newTabs = existing.allowed_tabs;
      if (updates.allowedTabs) {
        newTabs = JSON.stringify(updates.allowedTabs);
      }

      await dbService.execute(
        `UPDATE user_accounts 
         SET name = ?, email_or_phone = ?, role = ?, designation = ?, password_hash = ?, pin_code = ?, allowed_tabs = ?, is_active = ?
         WHERE id = ?;`,
        [newName, newEmail, newRole, newDesignation, newPasswordHash, newPin, newTabs, newIsActive, id]
      );

      await dbService.flush();
      return { success: true, message: 'Employee account updated successfully.' };
    } catch (err: any) {
      console.error('[AuthService] Error updating staff account:', err);
      return { success: false, message: `Failed to update employee: ${err.message || String(err)}` };
    }
  }

  /**
   * Toggles active state of an employee account (Kill Switch).
   */
  public async toggleUserActive(id: string, isActive: boolean): Promise<{ success: boolean; message: string }> {
    try {
      await dbService.initialize();
      const user = await dbService.query<any>("SELECT role FROM user_accounts WHERE id = ?;", [id]);
      if (user && user[0] && user[0].role === 'master' && !isActive) {
        return { success: false, message: 'The primary Master Administrator cannot be deactivated.' };
      }

      await dbService.execute(
        "UPDATE user_accounts SET is_active = ? WHERE id = ?;",
        [isActive ? 1 : 0, id]
      );
      await dbService.flush();

      return {
        success: true,
        message: isActive ? 'Account reactivated successfully.' : 'Account locked and deactivated.'
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error toggling account status.' };
    }
  }

  /**
   * Deletes a staff account (Master account cannot be deleted).
   */
  public async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await dbService.initialize();
      const user = await dbService.query<any>("SELECT role FROM user_accounts WHERE id = ?;", [id]);
      if (user && user[0] && user[0].role === 'master') {
        return { success: false, message: 'The primary Master Administrator account cannot be deleted.' };
      }

      await dbService.execute("DELETE FROM user_accounts WHERE id = ?;", [id]);
      await dbService.flush();

      return { success: true, message: 'Employee account removed successfully.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error deleting account.' };
    }
  }

  /**
   * Session Management
   */
  public getCurrentUser(): UserAccount | null {
    return this.currentUser;
  }

  public setCurrentUser(user: UserAccount | null, keepLoggedIn: boolean = true): void {
    this.currentUser = user;
    if (typeof window !== 'undefined' && window.localStorage) {
      if (user) {
        window.localStorage.setItem(SESSION_USER_KEY, user.id);
        window.localStorage.setItem(SESSION_KEEP_LOGGED_IN_KEY, String(keepLoggedIn));
      } else {
        window.localStorage.removeItem(SESSION_USER_KEY);
      }
    }
  }

  public async restoreSession(): Promise<UserAccount | null> {
    if (typeof window === 'undefined' || !window.localStorage) return null;

    const savedId = window.localStorage.getItem(SESSION_USER_KEY);
    const keepLoggedIn = window.localStorage.getItem(SESSION_KEEP_LOGGED_IN_KEY) === 'true';

    if (!savedId || !keepLoggedIn) {
      return null;
    }

    if (savedId === GUEST_USER.id) {
      const guest = this.getGuestUser();
      this.currentUser = guest;
      return guest;
    }

    try {
      await dbService.initialize();
      const rows = await dbService.query<any>(
        "SELECT * FROM user_accounts WHERE id = ? AND is_active = 1;",
        [savedId]
      );

      if (rows && rows.length > 0) {
        const r = rows[0];
        let allowedTabs: string[] = [];
        try {
          allowedTabs = typeof r.allowed_tabs === 'string' ? JSON.parse(r.allowed_tabs) : r.allowed_tabs;
        } catch {
          allowedTabs = ROLE_PRESET_TABS[r.role as UserRole] || ROLE_PRESET_TABS.employee;
        }

        const user: UserAccount = {
          id: r.id,
          name: r.name,
          username: r.username,
          email_or_phone: r.email_or_phone || undefined,
          role: r.role as UserRole,
          designation: r.designation || undefined,
          allowed_tabs: allowedTabs,
          is_active: true,
          created_at: r.created_at,
          last_active_at: new Date().toISOString()
        };

        this.currentUser = user;
        return user;
      }
    } catch (err) {
      console.warn('[AuthService] Could not restore saved session:', err);
    }
    return null;
  }

  public logout(): void {
    this.currentUser = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(SESSION_USER_KEY);
      window.localStorage.removeItem(SESSION_KEEP_LOGGED_IN_KEY);
    }
  }
}

export const authService = AuthService.getInstance();
