<div align="center">

<img src="build/icon.png" width="120" height="120" alt="Probaho ERP Logo" style="border-radius: 28px; box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4);" />

# Probaho ERP
### Enterprise Supply Chain, Procurement & Multi-Warehouse Operations Suite

[![Release](https://img.shields.io/badge/Release-v1.0.0-emerald?style=for-the-badge&logo=windows)](https://github.com/GlichPoP/probaho-erp/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows_x64-blue?style=for-the-badge&logo=electron)](https://github.com/GlichPoP/probaho-erp/releases)
[![Architecture](https://img.shields.io/badge/Architecture-Offline--First_SQLite-indigo?style=for-the-badge&logo=sqlite)](https://github.com/GlichPoP/probaho-erp)
[![License](https://img.shields.io/badge/License-Freeware-purple?style=for-the-badge)](LICENSE)

<p align="center">
  <b>A lightweight, offline-first enterprise supply chain management suite designed for distributors, retailers, and logistics managers.</b>
</p>

[Download Setup Installer (.exe)](https://github.com/GlichPoP/probaho-erp/releases) • [Download Portable (.exe)](https://github.com/GlichPoP/probaho-erp/releases) • [Report an Issue](https://github.com/GlichPoP/probaho-erp/issues)

</div>

---

## 🌟 Executive Overview

**Probaho ERP** is an offline-first enterprise resource planning and supply chain management suite built for modern retail networks, logistics managers, and multi-location distributors. Engineered with **Electron**, **React 19**, **TypeScript**, and **SQLite via WebAssembly (`sql.js`)**, Probaho ERP delivers zero-latency desktop workflows with relational data persistence without external server dependencies or recurring cloud fees.

Whether coordinating multi-warehouse inventory, issuing vendor purchase orders, inspecting goods receipts (GRN), tracking outbound waybills, or auditing cash flow ledgers, Probaho ERP operates completely locally with full privacy, resilience, and speed.

---

## 🚀 Key Architectural Capabilities

### 1. Offline-First Relational Engine (SQLite + WebAssembly)
- **Zero Cloud Latency**: All vendor directories, procurement orders, inventory counts, and financial ledgers persist locally inside a high-speed SQLite database (`probaho_erp.db`).
- **Data Sovereignty & Privacy**: Business operations and financial records never leave your local hardware unless explicitly exported.
- **Automated Snapshots & Local Backups**: One-click encrypted snapshot backups and seamless restoration engine.

### 2. Multi-Warehouse Inventory & Bin/Batch Control
- **Real-Time Stock Valuation**: Track stock valuation (FIFO / Weighted Average) across distributed warehouses.
- **Inter-Warehouse Stock Transfers**: Reconcile in-transit stock movements and physical receipt counts.
- **Automated Low-Stock Thresholds**: Intelligent alerts preventing stockouts before they affect fulfillment.

### 3. Procurement & Vendor Management
- **Vendor Directory**: Comprehensive supplier profiles, contact details, payment terms, and lead-time tracking.
- **Purchase Order (PO) Lifecycles**: Multi-stage PO workflows (Draft &rarr; Issued &rarr; Partially Received &rarr; Received &rarr; Closed).
- **Goods Receipt Notes (GRN)**: Formal inspection and receiving workflows directly updating inventory counts.

### 4. Fulfillment & Logistics Management
- **Outbound Shipments & Waybills**: Generate professional dispatch notes and track shipment fulfillment status.
- **Carrier & Courier Tracking**: Integrated status workflows for local and national logistics partners.
- **Return to Origin (RTO) Management**: Systematic tracking and restocking of returned shipments.

### 5. Enterprise Branding & Dynamic Print Vouchers
- **Custom Corporate Identity**: Upload your company logo (supports PDF, SVG, and raster images) with live sidebar and voucher previews.
- **Formal Documentation**: Generate high-resolution print vouchers, purchase order slips, and delivery waybills.

---

## 📦 Distribution Formats

Probaho ERP is packaged in two standalone Windows x64 distributions:

1. **Windows Setup Installer (`Probaho.ERP.Setup.1.0.0.exe`)**:
   - Standard NSIS installer with desktop shortcuts, Start Menu integration, and clean uninstaller.
2. **Standalone Portable Edition (`Probaho.ERP-Portable.exe`)**:
   - Zero-installation executable. Runs directly from any USB flash drive or local folder with self-contained `ProbahoData` directory.

---

## 💻 Tech Stack

- **Runtime**: [Electron](https://www.electronjs.org/) (Frameless window, hardened IPC, context isolation)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/)
- **Bundler**: [Vite](https://vitejs.dev/)
- **Database**: [SQLite WebAssembly](https://sql.js.org/) (`sql.js`)
- **Icons & UI**: [Lucide React](https://lucide.dev/)
- **Charts & Telemetry**: [Recharts](https://recharts.org/)

---

## 🛠️ Development & Building

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x

### Quick Start
```bash
# Clone the repository
git clone https://github.com/GlichPoP/probaho-erp.git
cd probaho-erp

# Install dependencies
npm install

# Start development mode
npm run dev

# Launch desktop development application
npm run electron:dev
```

### Building Distribution Binaries
```bash
# Compile and build Windows Setup Installer & Portable Executables
npm run electron:build
```

---

## 📄 License & Terms of Use

This software is distributed as **Freeware** under the [End User License Agreement](LICENSE).
- **Free to Use**: You are free to download, install, and operate Probaho ERP for personal, commercial, showroom, wholesale, and retail enterprise operations without payment of licensing royalties or subscription fees.
- **No Modifications / No Derivatives**: All intellectual property and proprietary rights belong solely to **Irfanur Rahman**. You may **not** alter, modify, decompile, disassemble, rebrand, or create derivative works based upon this software or its source code. Original, untouched distribution packages may be shared as published.
- **Community Shout-Outs (Voluntary)**: If you find this software helpful in running your business operations, giving a shout-out or credit to **Irfanur Rahman** ([LinkedIn](https://www.linkedin.com/in/irfanur-rahman123/) • [GitHub](https://github.com/GlichPoP)) is warmly welcomed and appreciated, but is completely voluntary with zero mandatory force.
