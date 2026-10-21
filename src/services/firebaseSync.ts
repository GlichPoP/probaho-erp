// ============================================================================
// PROBAHO ERP: GOOGLE FIREBASE CLOUD SYNCHRONIZATION ENGINE
// File: src/services/firebaseSync.ts
// Features: Real-time Cloud Sync, Multi-Device Staff Access, Offline Persistence
// ============================================================================

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  type Firestore,
  type Unsubscribe
} from 'firebase/firestore';
import { dbService } from './db';

export type SyncStatus = 'connected' | 'syncing' | 'offline' | 'error' | 'disconnected';

export interface FirebaseConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
}

export interface CloudERPState {
  version: string;
  workspace_id: string;
  last_synced_at: string;
  last_synced_by: string;
  company_name: string;
  suppliers: any[];
  items: any[];
  warehouses: any[];
  warehouse_locations: any[];
  item_batches: any[];
  inventory_stock: any[];
  purchase_orders: any[];
  purchase_order_items: any[];
  goods_receipts: any[];
  goods_receipt_items: any[];
  stock_transfers: any[];
  stock_transfer_items: any[];
  couriers: any[];
  shipments: any[];
  shipment_items: any[];
  user_accounts: any[];
  system_settings: any[];
}

const CONFIG_STORAGE_KEY = 'PROBAHO_ERP_FIREBASE_CONFIG';
const WORKSPACE_STORAGE_KEY = 'PROBAHO_ERP_WORKSPACE_ID';

class FirebaseSyncService {
  private static instance: FirebaseSyncService | null = null;
  private app: FirebaseApp | null = null;
  private db: Firestore | null = null;
  private activeConfig: FirebaseConfig | null = null;
  private activeWorkspaceId: string | null = null;
  private status: SyncStatus = 'disconnected';
  private statusListeners: Array<(status: SyncStatus) => void> = [];
  private unsubscribeSnapshot: Unsubscribe | null = null;
  private isPushingInternally: boolean = false;

  private constructor() {
    this.initFromStorage();
  }

  public static getInstance(): FirebaseSyncService {
    if (!FirebaseSyncService.instance) {
      FirebaseSyncService.instance = new FirebaseSyncService();
    }
    return FirebaseSyncService.instance;
  }

  /**
   * Parses Firebase configuration from raw input (JSON or Javascript config snippet).
   */
  public parseFirebaseConfigInput(rawInput: string): FirebaseConfig | null {
    if (!rawInput || !rawInput.trim()) return null;
    const clean = rawInput.trim();

    // 1. Try direct JSON parse
    try {
      const parsed = JSON.parse(clean);
      if (parsed && (parsed.apiKey || parsed.api_key) && (parsed.projectId || parsed.project_id)) {
        return {
          apiKey: parsed.apiKey || parsed.api_key,
          authDomain: parsed.authDomain || parsed.auth_domain,
          projectId: parsed.projectId || parsed.project_id,
          storageBucket: parsed.storageBucket || parsed.storage_bucket,
          messagingSenderId: parsed.messagingSenderId || parsed.messaging_sender_id,
          appId: parsed.appId || parsed.app_id || `1:${parsed.projectId || parsed.project_id}:web:probaho-erp`,
          measurementId: parsed.measurementId || parsed.measurement_id
        };
      }
    } catch {
      // Continue to regex snippet parser
    }

    // 2. Extract from standard Firebase Web JavaScript snippet:
    // const firebaseConfig = { apiKey: "...", projectId: "...", ... };
    try {
      const extractKey = (keyName: string): string => {
        const regex = new RegExp(`['"]?${keyName}['"]?\\s*:\\s*['"]([^'"]+)['"]`, 'i');
        const match = clean.match(regex);
        return match ? match[1].trim() : '';
      };

      const apiKey = extractKey('apiKey');
      const projectId = extractKey('projectId');
      const authDomain = extractKey('authDomain');
      const storageBucket = extractKey('storageBucket');
      const messagingSenderId = extractKey('messagingSenderId');
      const appId = extractKey('appId');
      const measurementId = extractKey('measurementId');

      if (apiKey && projectId) {
        return {
          apiKey,
          projectId,
          authDomain: authDomain || undefined,
          storageBucket: storageBucket || undefined,
          messagingSenderId: messagingSenderId || undefined,
          appId: appId || `1:${projectId}:web:probaho-erp`,
          measurementId: measurementId || undefined
        };
      }
    } catch (err) {
      console.warn('[FirebaseSync] Error parsing JS snippet:', err);
    }

    return null;
  }

  private initFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const savedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
      const savedWorkspace = localStorage.getItem(WORKSPACE_STORAGE_KEY);

      if (savedConfig) {
        const config: FirebaseConfig = JSON.parse(savedConfig);
        this.activeConfig = config;
        this.activeWorkspaceId = savedWorkspace || 'PROBAHO-CENTRAL';
        this.initializeFirebase(config);
      } else {
        this.setStatus('disconnected');
      }
    } catch (err) {
      console.warn('[FirebaseSync] Could not auto-initialize Firebase from storage:', err);
      this.setStatus('error');
    }
  }

  private initializeFirebase(config: FirebaseConfig): boolean {
    try {
      if (this.unsubscribeSnapshot) {
        this.unsubscribeSnapshot();
        this.unsubscribeSnapshot = null;
      }

      const existingApps = getApps();
      const existing = existingApps.find(a => a.name === 'PROBAHO_ERP_CLOUD');
      if (existing) {
        this.app = existing;
      } else {
        this.app = initializeApp(config, 'PROBAHO_ERP_CLOUD');
      }

      try {
        this.db = initializeFirestore(this.app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        });
      } catch {
        this.db = getFirestore(this.app);
      }

      this.activeConfig = config;
      this.setStatus('connected');
      return true;
    } catch (err) {
      console.error('[FirebaseSync] Failed to initialize Firebase instance:', err);
      this.setStatus('error');
      return false;
    }
  }

  public getStatus(): SyncStatus {
    return this.status;
  }

  public getActiveConfig(): FirebaseConfig | null {
    return this.activeConfig;
  }

  public getActiveWorkspaceId(): string {
    if (this.activeWorkspaceId) return this.activeWorkspaceId;
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(WORKSPACE_STORAGE_KEY) || 'PROBAHO-WORKSPACE';
    }
    return 'PROBAHO-WORKSPACE';
  }

  public setWorkspaceId(workspaceId: string): void {
    const cleanId = (workspaceId || 'PROBAHO-WORKSPACE').trim().toUpperCase();
    this.activeWorkspaceId = cleanId;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, cleanId);
    }
  }

  private setStatus(newStatus: SyncStatus): void {
    this.status = newStatus;
    this.statusListeners.forEach(listener => {
      try {
        listener(newStatus);
      } catch (err) {
        console.error('[FirebaseSync] Error in status listener:', err);
      }
    });
  }

  public onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusListeners.push(callback);
    callback(this.status);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== callback);
    };
  }

  /**
   * Tests and saves the Firebase configuration and Workspace ID.
   */
  public async connectWithConfig(
    config: FirebaseConfig,
    workspaceId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.setStatus('syncing');
      const cleanId = (workspaceId || 'PROBAHO-CENTRAL').trim().toUpperCase();
      const ok = this.initializeFirebase(config);
      if (!ok || !this.db) {
        this.setStatus('error');
        return { success: false, message: 'Could not initialize Firebase client. Please verify credentials.' };
      }

      // Ping test write to verify Firestore security rules
      const pingDocRef = doc(this.db, 'workspaces', cleanId, 'system', 'connection_test');
      await setDoc(pingDocRef, {
        client: 'Probaho ERP Suite',
        status: 'active',
        tested_at: new Date().toISOString()
      }, { merge: true });

      // Save credentials in storage & SQLite system settings
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
      }
      this.setWorkspaceId(cleanId);

      try {
        await dbService.execute(
          "INSERT OR REPLACE INTO system_settings (key, value, category, description) VALUES ('firebase_workspace_id', ?, 'cloud', 'Connected Firebase workspace ID');",
          [cleanId]
        );
        await dbService.execute(
          "INSERT OR REPLACE INTO system_settings (key, value, category, description) VALUES ('firebase_project_id', ?, 'cloud', 'Connected Firebase project ID');",
          [config.projectId]
        );
        await dbService.flush();
      } catch {
        // ignore
      }

      this.setStatus('connected');
      return {
        success: true,
        message: `Successfully connected to Firebase Project [${config.projectId}]! Cloud Workspace [${cleanId}] is active.`
      };
    } catch (err: any) {
      console.error('[FirebaseSync] Connection test failed:', err);
      this.setStatus('error');
      let msg = err.message || 'Unknown connection error';
      if (err.code === 'permission-denied') {
        msg = 'Permission Denied! In your Firebase Console, open "Firestore Database" -> "Rules" tab and allow read/write.';
      } else if (err.code === 'unavailable') {
        msg = 'Network Unavailable. Please check your internet connection and verify Firestore is created in Firebase Console.';
      }
      return { success: false, message: msg };
    }
  }

  public disconnect(): void {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
    this.activeConfig = null;
    this.app = null;
    this.db = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
    }
    this.setStatus('disconnected');
  }

  /**
   * Pushes all local SQLite tables to Google Firebase Firestore.
   */
  public async pushLocalDataToCloud(performedBy: string = 'Master Admin'): Promise<{
    success: boolean;
    message: string;
    counts?: Record<string, number>;
  }> {
    if (!this.db) {
      return { success: false, message: 'Firebase is not connected. Please configure credentials first.' };
    }

    try {
      this.isPushingInternally = true;
      this.setStatus('syncing');

      const cleanId = this.getActiveWorkspaceId();
      await dbService.initialize();

      // Query all primary relational tables
      const [
        suppliers, items, warehouses, warehouseLocations, itemBatches,
        inventoryStock, purchaseOrders, purchaseOrderItems, goodsReceipts,
        goodsReceiptItems, stockTransfers, stockTransferItems, couriers,
        shipments, shipmentItems, userAccounts, systemSettings
      ] = await Promise.all([
        dbService.query("SELECT * FROM suppliers;"),
        dbService.query("SELECT * FROM items;"),
        dbService.query("SELECT * FROM warehouses;"),
        dbService.query("SELECT * FROM warehouse_locations;"),
        dbService.query("SELECT * FROM item_batches;"),
        dbService.query("SELECT * FROM inventory_stock;"),
        dbService.query("SELECT * FROM purchase_orders;"),
        dbService.query("SELECT * FROM purchase_order_items;"),
        dbService.query("SELECT * FROM goods_receipts;"),
        dbService.query("SELECT * FROM goods_receipt_items;"),
        dbService.query("SELECT * FROM stock_transfers;"),
        dbService.query("SELECT * FROM stock_transfer_items;"),
        dbService.query("SELECT * FROM couriers;"),
        dbService.query("SELECT * FROM shipments;"),
        dbService.query("SELECT * FROM shipment_items;"),
        dbService.query("SELECT * FROM user_accounts;"),
        dbService.query("SELECT * FROM system_settings;")
      ]);

      const now = new Date().toISOString();
      const companyRow = systemSettings.find((s: any) => s.key === 'company_name');
      const companyName = companyRow?.value || 'Probaho Supply Chain Ltd.';

      const payload: CloudERPState = {
        version: '1.0.0',
        workspace_id: cleanId,
        last_synced_at: now,
        last_synced_by: performedBy,
        company_name: companyName,
        suppliers,
        items,
        warehouses,
        warehouse_locations: warehouseLocations,
        item_batches: itemBatches,
        inventory_stock: inventoryStock,
        purchase_orders: purchaseOrders,
        purchase_order_items: purchaseOrderItems,
        goods_receipts: goodsReceipts,
        goods_receipt_items: goodsReceiptItems,
        stock_transfers: stockTransfers,
        stock_transfer_items: stockTransferItems,
        couriers,
        shipments,
        shipment_items: shipmentItems,
        user_accounts: userAccounts,
        system_settings: systemSettings
      };

      // Push to Firestore under workspaces/{workspaceId}/data/erp_state
      const docRef = doc(this.db, 'workspaces', cleanId, 'data', 'erp_state');
      await setDoc(docRef, payload, { merge: true });

      // Update workspace root metadata directory
      const metaRef = doc(this.db, 'workspaces', cleanId);
      await setDoc(metaRef, {
        workspace_id: cleanId,
        company_name: companyName,
        updated_at: now,
        last_synced_by: performedBy,
        items_count: items.length,
        warehouses_count: warehouses.length,
        pos_count: purchaseOrders.length,
        shipments_count: shipments.length,
        staff_count: userAccounts.length
      }, { merge: true });

      // Update local last synced timestamp
      try {
        await dbService.execute(
          "INSERT OR REPLACE INTO system_settings (key, value, category, description) VALUES ('firebase_last_synced_at', ?, 'cloud', 'Last cloud sync timestamp');",
          [now]
        );
        await dbService.flush();
      } catch {
        // ignore
      }

      this.setStatus('connected');
      const counts = {
        items: items.length,
        warehouses: warehouses.length,
        purchaseOrders: purchaseOrders.length,
        shipments: shipments.length,
        staff: userAccounts.length
      };

      return {
        success: true,
        message: `Cloud sync complete! Pushed ${items.length} items, ${warehouses.length} warehouses, and ${userAccounts.length} employee accounts to Firebase.`,
        counts
      };
    } catch (err: any) {
      console.error('[FirebaseSync] Error pushing data to cloud:', err);
      this.setStatus('error');
      return { success: false, message: `Failed to push data: ${err.message || String(err)}` };
    } finally {
      setTimeout(() => {
        this.isPushingInternally = false;
      }, 500);
    }
  }

  /**
   * Pulls the latest cloud database snapshot from Firebase and synchronizes into local SQLite.
   */
  public async pullCloudDataToLocal(workspaceId?: string): Promise<{
    success: boolean;
    message: string;
    counts?: Record<string, number>;
  }> {
    if (!this.db) {
      return { success: false, message: 'Firebase is not connected. Please configure credentials first.' };
    }

    try {
      this.setStatus('syncing');
      const cleanId = (workspaceId || this.getActiveWorkspaceId()).trim().toUpperCase();
      const docRef = doc(this.db, 'workspaces', cleanId, 'data', 'erp_state');
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        this.setStatus('connected');
        return {
          success: false,
          message: `Workspace [${cleanId}] does not contain any cloud data yet. Push from the Master account first.`
        };
      }

      const remote = snap.data() as CloudERPState;
      if (!remote) {
        this.setStatus('connected');
        return { success: false, message: 'Empty cloud snapshot received.' };
      }

      await dbService.initialize();

      // Transactionally upsert remote tables into local SQLite
      await dbService.transaction(async (tx) => {
        // 1. Items
        if (Array.isArray(remote.items)) {
          for (const item of remote.items) {
            await tx.execute(
              `INSERT OR REPLACE INTO items (id, sku, name, description, category, unit_of_measure, cost_price, selling_price, min_stock_alert, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [item.id, item.sku, item.name, item.description || null, item.category || 'General', item.unit_of_measure || 'units', item.cost_price || 0, item.selling_price || 0, item.min_stock_alert || 0, item.is_active ?? 1]
            );
          }
        }

        // 2. Warehouses
        if (Array.isArray(remote.warehouses)) {
          for (const wh of remote.warehouses) {
            await tx.execute(
              `INSERT OR REPLACE INTO warehouses (id, warehouse_code, name, address, city, country, contact_number, is_active, is_default)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [wh.id, wh.warehouse_code, wh.name, wh.address || '', wh.city || '', wh.country || 'Bangladesh', wh.contact_number || '', wh.is_active ?? 1, wh.is_default ?? 0]
            );
          }
        }

        // 3. User Accounts (Enables multi-device staff login!)
        if (Array.isArray(remote.user_accounts)) {
          for (const u of remote.user_accounts) {
            await tx.execute(
              `INSERT OR REPLACE INTO user_accounts (id, name, username, email_or_phone, role, password_hash, pin_code, designation, allowed_tabs, is_active, created_by, created_at, last_active_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [u.id, u.name, u.username, u.email_or_phone || null, u.role, u.password_hash || null, u.pin_code || null, u.designation || null, typeof u.allowed_tabs === 'string' ? u.allowed_tabs : JSON.stringify(u.allowed_tabs || []), u.is_active ?? 1, u.created_by || 'master', u.created_at || new Date().toISOString(), u.last_active_at || null]
            );
          }
        }

        // 4. Stock Levels
        if (Array.isArray(remote.inventory_stock)) {
          for (const s of remote.inventory_stock) {
            await tx.execute(
              `INSERT OR REPLACE INTO inventory_stock (id, item_id, warehouse_id, location_id, batch_id, quantity_on_hand, quantity_reserved)
               VALUES (?, ?, ?, ?, ?, ?, ?);`,
              [s.id, s.item_id, s.warehouse_id, s.location_id || null, s.batch_id || null, s.quantity_on_hand || 0, s.quantity_reserved || 0]
            );
          }
        }

        // 5. Purchase Orders
        if (Array.isArray(remote.purchase_orders)) {
          for (const po of remote.purchase_orders) {
            await tx.execute(
              `INSERT OR REPLACE INTO purchase_orders (id, po_number, supplier_id, warehouse_id, status, subtotal, tax_amount, total_amount, currency, notes, ordered_at, expected_at, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [po.id, po.po_number, po.supplier_id, po.warehouse_id, po.status, po.subtotal || 0, po.tax_amount || 0, po.total_amount || 0, po.currency || 'USD', po.notes || null, po.ordered_at || null, po.expected_at || null, po.created_by || 'system']
            );
          }
        }

        // 6. Shipments
        if (Array.isArray(remote.shipments)) {
          for (const sh of remote.shipments) {
            await tx.execute(
              `INSERT OR REPLACE INTO shipments (id, shipment_number, origin_warehouse_id, recipient_name, recipient_phone, shipping_address, city, courier_id, tracking_number, status, shipping_fee, notes, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [sh.id, sh.shipment_number, sh.origin_warehouse_id, sh.recipient_name, sh.recipient_phone, sh.shipping_address, sh.city || '', sh.courier_id || null, sh.tracking_number || null, sh.status, sh.shipping_fee || 0, sh.notes || null, sh.created_by || 'system']
            );
          }
        }

        // 7. Suppliers
        if (Array.isArray(remote.suppliers)) {
          for (const sup of remote.suppliers) {
            await tx.execute(
              `INSERT OR REPLACE INTO suppliers (id, supplier_code, name, contact_person, email, phone, address, city, country, tax_id, payment_terms_days, lead_time_days, rating, performance_score, total_pos_issued, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [sup.id, sup.supplier_code, sup.name, sup.contact_person || null, sup.email || null, sup.phone, sup.address, sup.city || null, sup.country || 'Bangladesh', sup.tax_id || null, sup.payment_terms_days || 30, sup.lead_time_days || 7, sup.rating || 5.0, sup.performance_score || 100.0, sup.total_pos_issued || 0, sup.is_active ?? 1]
            );
          }
        }
      });

      await dbService.flush();
      this.setStatus('connected');

      const counts = {
        items: remote.items?.length || 0,
        warehouses: remote.warehouses?.length || 0,
        purchaseOrders: remote.purchase_orders?.length || 0,
        shipments: remote.shipments?.length || 0,
        staff: remote.user_accounts?.length || 0
      };

      return {
        success: true,
        message: `Successfully synchronized from Cloud! Imported ${counts.items} items, ${counts.warehouses} warehouses, and ${counts.staff} user accounts.`,
        counts
      };
    } catch (err: any) {
      console.error('[FirebaseSync] Error pulling cloud data:', err);
      this.setStatus('error');
      return { success: false, message: `Failed to pull cloud data: ${err.message || String(err)}` };
    }
  }

  /**
   * Subscribes to real-time snapshot changes from Firebase.
   */
  public subscribeToCloudUpdates(onRemoteDataReceived: (remoteData: CloudERPState) => void): () => void {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }

    if (!this.db) {
      return () => {};
    }

    const cleanId = this.getActiveWorkspaceId();
    const docRef = doc(this.db, 'workspaces', cleanId, 'data', 'erp_state');

    try {
      this.unsubscribeSnapshot = onSnapshot(docRef, (snapshot) => {
        if (this.isPushingInternally) return;

        if (snapshot.exists()) {
          const remote = snapshot.data() as CloudERPState;
          if (remote) {
            this.setStatus('connected');
            onRemoteDataReceived(remote);
          }
        }
      }, (err) => {
        console.warn('[FirebaseSync] Snapshot listener error:', err);
        if (err.code === 'unavailable') {
          this.setStatus('offline');
        } else {
          this.setStatus('error');
        }
      });

      return () => {
        if (this.unsubscribeSnapshot) {
          this.unsubscribeSnapshot();
          this.unsubscribeSnapshot = null;
        }
      };
    } catch (err) {
      console.error('[FirebaseSync] Failed to attach snapshot listener:', err);
      return () => {};
    }
  }
}

export const firebaseSync = FirebaseSyncService.getInstance();
