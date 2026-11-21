<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
    <!-- Top Navigation Bar -->
    <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <span class="text-xl">🧾</span>
        </div>
        <div>
          <h1 class="text-base font-bold text-white tracking-wide">ZATCA Invoice Processor</h1>
          <p class="text-xs text-slate-400">
            Database: <span class="text-cyan-400 font-mono font-medium">{{ activeDbName || detectedDbName || 'Not Connected' }}</span>
            • Table: <span class="text-indigo-400 font-mono font-medium">{{ tableName || 'masterTrx' }}</span>
          </p>
        </div>
      </div>

      <!-- Header Action Controls -->
      <div class="flex items-center gap-2.5">
        <!-- Switch between Connection Settings and Invoices Page -->
        <button
          v-if="currentPage === 'invoices'"
          @click="currentPage = 'connection'"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 transition cursor-pointer"
          title="Change SQL Server Connection & Table"
        >
          <span>⚙️</span>
          <span>Connection Settings</span>
        </button>

        <button
          v-else-if="isConnected"
          @click="currentPage = 'invoices'"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 transition cursor-pointer"
        >
          <span>📊</span>
          <span>Back to Invoices</span>
        </button>

        <!-- Hide to System Tray Button -->
        <button
          @click="minimizeToTray"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 transition cursor-pointer"
          title="Minimize to Windows System Tray"
        >
          <span>📥</span>
          <span>Hide to Tray</span>
        </button>

        <!-- Status Indicator Pill -->
        <span
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
          :class="statusBadgeClass"
        >
          <span class="w-2 h-2 rounded-full" :class="statusDotClass"></span>
          <span>{{ statusBadgeText }}</span>
        </span>
      </div>
    </header>

    <!-- ========================================================================= -->
    <!-- PAGE 1: DATABASE & TABLE CONNECTION SETUP PAGE                            -->
    <!-- ========================================================================= -->
    <main v-if="currentPage === 'connection'" class="flex-1 flex items-center justify-center p-6">
      <div class="w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
        <!-- Header -->
        <div class="text-center mb-6">
          <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-xl shadow-cyan-500/20">
            <span class="text-2xl">⚙️</span>
          </div>
          <h2 class="text-2xl font-bold text-white tracking-tight">Application Connection Settings</h2>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Centralized configuration for SQL Server, target invoice table, and ZATCA API.
          </p>
        </div>

        <!-- Centralized Config File Path Banner -->
        <div v-if="configFilePath" class="mb-5 bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-[11px] text-slate-400">
          <div class="flex items-center gap-2 truncate">
            <span class="text-slate-500 font-semibold shrink-0">📁 Config File:</span>
            <span class="font-mono text-cyan-400 truncate" :title="configFilePath">{{ configFilePath }}</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 ml-2">
            <button
              type="button"
              @click="copyText(configFilePath, 'cfg-file-path')"
              class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Copy configuration file path"
            >
              {{ copiedKey === 'cfg-file-path' ? '✓ Copied' : '📋 Copy' }}
            </button>
            <button
              type="button"
              @click="openConfigFolder"
              class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Open folder containing configuration file"
            >
              📂 Open
            </button>
          </div>
        </div>

        <!-- Success Alert Banner -->
        <div v-if="saveSuccessMsg" class="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-400 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span>✓</span>
            <span>{{ saveSuccessMsg }}</span>
          </div>
          <button type="button" @click="saveSuccessMsg = ''" class="text-emerald-400 hover:text-emerald-200">✕</button>
        </div>

        <!-- Form -->
        <form @submit.prevent="handleConnect" class="space-y-5">
          <!-- Connection String Input -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                SQL Connection String
              </label>
              <button
                type="button"
                @click="resetToDefault"
                class="text-[11px] text-cyan-400 hover:text-cyan-300 transition"
              >
                Insert Default Preset
              </button>
            </div>
            <textarea
              v-model="connectionString"
              rows="3"
              required
              placeholder="Server=MASKAT\SQLEXPRESS;Database=Unimarine;Trusted_Connection=True;Connection Timeout=30;"
              class="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition resize-none leading-relaxed"
            ></textarea>
            <!-- Realtime Extracted DB Helper -->
            <div class="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                Detected DB:
                <strong class="text-cyan-400 font-mono">{{ detectedDbName || 'Not specified' }}</strong>
              </span>
              <span class="text-slate-500">Supports Windows &amp; SQL Authentication</span>
            </div>
          </div>

          <!-- Table Name Input -->
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Invoice Table Name
            </label>
            <div class="relative">
              <input
                v-model="tableName"
                type="text"
                required
                placeholder="masterTrx"
                class="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
              />
              <span class="absolute right-3.5 top-2.5 text-xs text-slate-500 font-mono">default: masterTrx</span>
            </div>
          </div>

          <!-- ZATCA API Endpoint Input -->
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              ZATCA Issue-Invoice Endpoint
            </label>
            <div class="relative">
              <input
                v-model="zatcaEndpoint"
                type="url"
                required
                placeholder="http://10.105.114.65:8000/api/zatca/issue-invoice"
                class="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
            <p class="mt-1 text-[11px] text-slate-500">Base URL or complete endpoint. Used globally for issuing and verifying invoices.</p>
          </div>

          <!-- Error Alert Banner -->
          <div v-if="connectionError" class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-xs text-red-400 flex items-start gap-3">
            <span class="text-base leading-none">⚠️</span>
            <div class="flex-1">
              <strong class="font-semibold block mb-0.5">Connection Error:</strong>
              <p class="font-mono text-[11px] whitespace-pre-wrap break-all">{{ connectionError }}</p>
            </div>
            <button type="button" @click="connectionError = ''" class="text-red-400 hover:text-red-200 text-sm">✕</button>
          </div>

          <!-- Action Buttons: Save Only & Save and Connect -->
          <div class="pt-2 flex items-center gap-3">
            <button
              type="button"
              @click="handleSaveConfigOnly"
              :disabled="isSavingConfig || !connectionString.trim() || !tableName.trim()"
              class="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition text-xs font-semibold text-slate-200 border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>💾</span>
              <span>{{ isSavingConfig ? 'Saving...' : 'Save Settings to File' }}</span>
            </button>

            <button
              type="submit"
              :disabled="isConnecting || !connectionString.trim() || !tableName.trim()"
              class="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition text-xs font-semibold text-white shadow-xl shadow-cyan-600/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg v-if="isConnecting" class="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
              </svg>
              <span>{{ isConnecting ? 'Testing...' : 'Save & Connect' }}</span>
              <span v-if="!isConnecting">→</span>
            </button>
          </div>
        </form>
      </div>
    </main>

    <!-- ========================================================================= -->
    <!-- PAGE 2: RESTRUCTURED INVOICE DASHBOARD & TABLE                            -->
    <!-- ========================================================================= -->
    <main v-else class="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
      <!-- KPI / Stats Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col hover:border-slate-700 transition">
          <span class="text-xs text-slate-400">Total Invoices</span>
          <span class="text-2xl font-bold text-white mt-1">{{ invoices.length }}</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col hover:border-slate-700 transition">
          <span class="text-xs text-slate-400">With VAT No</span>
          <span class="text-2xl font-bold text-cyan-400 mt-1">{{ stats.withVat }}</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col hover:border-slate-700 transition">
          <span class="text-xs text-slate-400">With JATCA QR Code</span>
          <span class="text-2xl font-bold text-emerald-400 mt-1">{{ stats.withQr }}</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col hover:border-slate-700 transition">
          <span class="text-xs text-slate-400">With Hash Key</span>
          <span class="text-2xl font-bold text-indigo-400 mt-1">{{ stats.withHash }}</span>
        </div>
      </div>

      <!-- Action & Search Control Bar -->
      <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-3 flex-wrap">
          <button
            @click="fetchInvoices"
            :disabled="isLoadingInvoices"
            class="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-semibold text-white shadow-lg shadow-cyan-600/30 flex items-center gap-2"
          >
            <svg v-if="isLoadingInvoices" class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
            <span v-else>🔄</span>
            <span>{{ isLoadingInvoices ? 'Loading...' : `Fetch from ${tableName}` }}</span>
          </button>

          <div class="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl">
            <span>Limit:</span>
            <select v-model="limit" @change="fetchInvoices" class="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer">
              <option :value="20" class="bg-slate-900">20</option>
              <option :value="50" class="bg-slate-900">50</option>
              <option :value="100" class="bg-slate-900">100</option>
              <option :value="500" class="bg-slate-900">500</option>
            </select>
          </div>

          <!-- Quick Filter Tabs -->
          <div class="flex items-center bg-slate-950/80 border border-slate-800 p-1 rounded-xl gap-1 text-xs">
            <button
              @click="filterTab = 'all'"
              class="px-2.5 py-1 rounded-lg font-medium transition cursor-pointer"
              :class="filterTab === 'all' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'"
            >
              All ({{ invoices.length }})
            </button>
            <button
              @click="filterTab = 'has_qr'"
              class="px-2.5 py-1 rounded-lg font-medium transition cursor-pointer"
              :class="filterTab === 'has_qr' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'"
            >
              With QR ({{ stats.withQr }})
            </button>
            <button
              @click="filterTab = 'missing_qr'"
              class="px-2.5 py-1 rounded-lg font-medium transition cursor-pointer"
              :class="filterTab === 'missing_qr' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'"
            >
              Missing QR ({{ stats.missingQr }})
            </button>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="relative w-full md:w-80">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search Doc #, Name, Vat, Hash..."
            class="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
          />
          <span class="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
          <span v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-slate-300 cursor-pointer">✕</span>
        </div>
      </div>

      <!-- Error Message Banner -->
      <div v-if="invoiceError" class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-xs text-red-400 flex items-start gap-3">
        <span class="text-base leading-none">⚠️</span>
        <div class="flex-1">
          <strong class="font-semibold block mb-1">SQL Query Error:</strong>
          <p class="font-mono break-all whitespace-pre-wrap">{{ invoiceError }}</p>
        </div>
        <button @click="invoiceError = ''" class="text-red-400 hover:text-red-200 text-sm">✕</button>
      </div>

      <!-- ======================================================================= -->
      <!-- RESTRUCTURED TABLE FOR: Name, Date, Doc, Vat, Invoice_qrcode, invoice_haskey -->
      <!-- ======================================================================= -->
      <div class="bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col flex-1">
        <!-- Table Subheader -->
        <div class="px-6 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-950/40">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-slate-200">Table: <span class="font-mono text-cyan-400">{{ tableName }}</span></span>
            <span>•</span>
            <span>Showing {{ filteredInvoices.length }} of {{ invoices.length }} rows</span>
            <span v-if="effectiveDate" class="text-amber-400 font-mono text-[11px] bg-amber-950/30 border border-amber-900/40 px-2 py-0.5 rounded">
              📅 Effective: {{ effectiveDate }}
            </span>
            <span v-if="searchQuery" class="text-cyan-400">• Filter active</span>
          </div>
          <span v-if="lastUpdated">Updated: {{ lastUpdated }}</span>
        </div>

        <!-- Table View -->
        <div class="overflow-x-auto flex-1 max-h-[560px]">
          <table v-if="filteredInvoices.length > 0" class="w-full text-left text-xs text-slate-300">
            <thead class="bg-slate-950/90 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th class="py-3.5 px-4 font-semibold text-slate-500 w-12 text-center">#</th>
                <th class="py-3.5 px-4 font-semibold text-cyan-400 whitespace-nowrap">Mdocnum</th>
                <th class="py-3.5 px-4 font-semibold text-slate-300 whitespace-nowrap">MtrxdateA</th>
                <th class="py-3.5 px-4 font-semibold text-slate-300">MsupcusName</th>
                <th class="py-3.5 px-4 font-semibold text-slate-300 whitespace-nowrap">vatno</th>
                <th class="py-3.5 px-4 font-semibold text-slate-300 text-center whitespace-nowrap">INVOICE_QRCODE</th>
                <th class="py-3.5 px-4 font-semibold text-slate-300 whitespace-nowrap">INVOICE_HASHKEY</th>
                <th class="py-3.5 px-4 font-semibold text-slate-300 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-sans">
              <tr
                v-for="(inv, idx) in filteredInvoices"
                :key="inv.Mdocnum || idx"
                class="hover:bg-slate-800/40 transition cursor-pointer group"
                @click="openDetails(inv)"
              >
                <!-- 1. Row Index -->
                <td class="py-3.5 px-4 text-center text-slate-500 font-mono text-[11px]">{{ idx + 1 }}</td>

                <!-- 2. Mdocnum -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 font-mono font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2.5 py-1 rounded-lg">
                    <span>📄</span>
                    <span>{{ inv.Mdocnum || '—' }}</span>
                  </span>
                </td>

                <!-- 3. MtrxdateA -->
                <td class="py-3.5 px-4 whitespace-nowrap font-mono text-slate-300">
                  <span class="inline-flex items-center gap-1.5 text-[11px]">
                    <span class="text-slate-500">📅</span>
                    <span>{{ inv.MtrxdateA || '—' }}</span>
                  </span>
                </td>

                <!-- 4. MsupcusName -->
                <td class="py-3.5 px-4 max-w-[240px]">
                  <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-400 font-bold shrink-0">
                      {{ (inv.MsupcusName || '?').charAt(0).toUpperCase() }}
                    </span>
                    <span class="font-medium text-white truncate text-xs" :title="inv.MsupcusName">
                      {{ inv.MsupcusName || '—' }}
                    </span>
                  </div>
                </td>

                <!-- 5. vatno -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <div v-if="inv.vatno" class="inline-flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded text-[11px] font-mono text-slate-300">
                    <span>{{ inv.vatno }}</span>
                    <button
                      @click.stop="copyText(inv.vatno, `vat-${idx}`)"
                      class="text-slate-500 hover:text-cyan-400 ml-1 transition"
                      title="Copy vatno"
                    >
                      {{ copiedKey === `vat-${idx}` ? '✓' : '📋' }}
                    </button>
                  </div>
                  <span v-else class="text-slate-600 font-mono">—</span>
                </td>

                <!-- 6. INVOICE_QRCODE -->
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                  <span
                    v-if="inv.INVOICE_QRCODE && String(inv.INVOICE_QRCODE).trim()"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  >
                    <span>✓</span>
                    <span>Ready</span>
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  >
                    <span>!</span>
                    <span>Missing</span>
                  </span>
                </td>

                <!-- 7. INVOICE_HASHKEY -->
                <td class="py-3.5 px-4 whitespace-nowrap max-w-[180px]">
                  <div v-if="inv.INVOICE_HASHKEY && String(inv.INVOICE_HASHKEY).trim()" class="flex items-center gap-1.5">
                    <span class="font-mono text-indigo-300 text-[11px] truncate bg-indigo-950/30 border border-indigo-900/30 px-2 py-0.5 rounded" :title="inv.INVOICE_HASHKEY">
                      {{ truncate(inv.INVOICE_HASHKEY, 14) }}
                    </span>
                    <button
                      @click.stop="copyText(inv.INVOICE_HASHKEY, `hash-${idx}`)"
                      class="text-xs text-slate-500 hover:text-indigo-400 transition"
                      title="Copy INVOICE_HASHKEY"
                    >
                      {{ copiedKey === `hash-${idx}` ? '✓' : '📋' }}
                    </button>
                  </div>
                  <span v-else class="text-slate-600 font-mono">—</span>
                </td>

                <!-- 8. Actions -->
                <td class="py-3.5 px-4 text-right whitespace-nowrap">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      @click.stop="handleZatcaVerify(inv)"
                      :disabled="verifyingDocnum === inv.Mdocnum"
                      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-white border border-emerald-500/40 active:scale-95 text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      title="Verify and issue this invoice with ZATCA Phase 2"
                    >
                      <svg v-if="verifyingDocnum === inv.Mdocnum" class="animate-spin h-3.5 w-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                      </svg>
                      <span v-else>🛡️</span>
                      <span>{{ verifyingDocnum === inv.Mdocnum ? 'Verifying...' : 'ZATCA Verify' }}</span>
                    </button>

                    <button
                      @click.stop="openDetails(inv)"
                      class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600/20 hover:text-cyan-400 hover:border-cyan-500/30 border border-slate-700/80 active:scale-95 text-xs text-slate-300 transition"
                    >
                      Details →
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Empty State -->
          <div v-else-if="!isLoadingInvoices" class="p-16 text-center text-slate-500 flex flex-col items-center justify-center">
            <span class="text-4xl mb-3">📁</span>
            <p class="text-sm font-medium text-slate-400">No invoices match your filter</p>
            <p class="text-xs mt-1 text-slate-500">Try adjusting your search or click "Fetch from {{ tableName }}".</p>
          </div>

          <!-- Loading State -->
          <div v-else class="p-16 text-center text-slate-400 flex flex-col items-center justify-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mb-3"></div>
            <p class="text-sm font-medium">Querying {{ tableName }} from SQL Server...</p>
          </div>
        </div>
      </div>
    </main>

    <!-- ========================================================================= -->
    <!-- INVOICE DETAIL & COMPLIANCE MODAL                                         -->
    <!-- ========================================================================= -->
    <div
      v-if="selectedInvoice"
      class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="selectedInvoice = null"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center text-lg">
              📄
            </div>
            <div>
              <h3 class="text-base font-bold text-white">Invoice #{{ selectedInvoice.Mdocnum || '—' }}</h3>
              <p class="text-xs text-slate-400">Date: {{ selectedInvoice.MtrxdateA || '—' }}</p>
            </div>
          </div>
          <button
            @click="selectedInvoice = null"
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <!-- Modal Body -->
        <div class="p-6 overflow-y-auto flex flex-col gap-4 text-xs text-slate-300">
          <!-- Customer & Vat Cards -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold block mb-1">
                Customer Name (MsupcusName)
              </span>
              <span class="text-white font-medium text-sm block truncate" :title="selectedInvoice.MsupcusName">
                {{ selectedInvoice.MsupcusName || '—' }}
              </span>
            </div>
            <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold block mb-1">
                VAT Number (vatno)
              </span>
              <span class="font-mono text-cyan-400 font-semibold text-sm">
                {{ selectedInvoice.vatno || '—' }}
              </span>
            </div>
          </div>

          <!-- Hash Key Section -->
          <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="text-slate-400 uppercase tracking-wider text-[10px] font-semibold flex items-center gap-1.5">
                <span>🔑</span>
                <span>INVOICE_HASHKEY</span>
              </span>
              <button
                v-if="selectedInvoice.INVOICE_HASHKEY"
                @click="copyText(selectedInvoice.INVOICE_HASHKEY, 'modal-hash')"
                class="text-indigo-400 hover:text-indigo-300 text-[11px] font-medium transition cursor-pointer"
              >
                {{ copiedKey === 'modal-hash' ? '✓ Copied!' : 'Copy INVOICE_HASHKEY' }}
              </button>
            </div>
            <p class="font-mono text-[11px] text-indigo-300 break-all bg-slate-900/90 p-3 rounded-lg border border-slate-800 select-all">
              {{ selectedInvoice.INVOICE_HASHKEY || 'No INVOICE_HASHKEY found for this record' }}
            </p>
          </div>

          <!-- JATCA QR Code Data Section -->
          <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="text-slate-400 uppercase tracking-wider text-[10px] font-semibold flex items-center gap-1.5">
                <span>📱</span>
                <span>INVOICE_QRCODE</span>
              </span>
              <button
                v-if="selectedInvoice.INVOICE_QRCODE"
                @click="copyText(selectedInvoice.INVOICE_QRCODE, 'modal-qr')"
                class="text-cyan-400 hover:text-cyan-300 text-[11px] font-medium transition cursor-pointer"
              >
                {{ copiedKey === 'modal-qr' ? '✓ Copied!' : 'Copy INVOICE_QRCODE' }}
              </button>
            </div>
            <p class="font-mono text-[11px] text-cyan-300 break-all bg-slate-900/90 p-3 rounded-lg border border-slate-800 max-h-40 overflow-y-auto select-all leading-relaxed">
              {{ selectedInvoice.INVOICE_QRCODE || 'No INVOICE_QRCODE found for this record' }}
            </p>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            @click="handleZatcaVerify(selectedInvoice)"
            :disabled="verifyingDocnum === selectedInvoice.Mdocnum"
            class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25"
          >
            <svg v-if="verifyingDocnum === selectedInvoice.Mdocnum" class="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
            <span v-else>🛡️</span>
            <span>{{ verifyingDocnum === selectedInvoice.Mdocnum ? 'Verifying with ZATCA...' : 'ZATCA Verify' }}</span>
          </button>

          <button
            @click="selectedInvoice = null"
            class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- ZATCA VERIFICATION RESULT MODAL                                           -->
    <!-- ========================================================================= -->
    <div
      v-if="isZatcaModalOpen && zatcaResult"
      class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="isZatcaModalOpen = false"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <!-- Result Header -->
        <div
          class="px-6 py-4 border-b flex items-center justify-between"
          :class="zatcaResult.success ? 'bg-emerald-950/40 border-emerald-800/40' : 'bg-red-950/40 border-red-800/40'"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              :class="zatcaResult.success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'"
            >
              <span v-if="zatcaResult.success">✓</span>
              <span v-else>⚠️</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-white">
                  {{ zatcaResult.success ? 'ZATCA Verification Succeeded' : 'ZATCA Verification Notice' }}
                </h3>
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                  :class="zatcaResult.success ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'"
                >
                  {{ zatcaResult.success ? 'Issued & Signed' : 'Failed' }}
                </span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">
                Doc #: <strong class="text-cyan-400 font-mono">{{ zatcaResult.docnum }}</strong>
                <span v-if="zatcaResult.invoiceNumber"> • Number: <strong class="text-white font-mono">{{ zatcaResult.invoiceNumber }}</strong></span>
                <span> • {{ zatcaResult.timestamp }}</span>
              </p>
            </div>
          </div>
          <button
            @click="isZatcaModalOpen = false"
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <!-- Result Body -->
        <div class="p-6 overflow-y-auto flex flex-col gap-4 text-xs text-slate-300">
          <!-- Primary Message Alert -->
          <div
            class="p-4 rounded-xl border flex items-start gap-3"
            :class="zatcaResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'"
          >
            <span class="text-lg leading-none">{{ zatcaResult.success ? '🎉' : '❌' }}</span>
            <div class="flex-1">
              <strong class="font-semibold block text-sm mb-0.5">
                {{ zatcaResult.data?.message || (zatcaResult.success ? 'Invoice successfully verified and processed.' : 'Verification Failed') }}
              </strong>
              <p v-if="zatcaResult.error" class="text-xs text-red-400 font-mono mt-1 whitespace-pre-wrap break-all">
                {{ zatcaResult.error }}
              </p>
            </div>
          </div>

          <!-- Compliance Warning (if returned by ZATCA) -->
          <div
            v-if="zatcaResult.data?.compliance?.warning"
            class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5"
          >
            <span class="text-base leading-none">⚠️</span>
            <div>
              <strong class="font-semibold block text-xs">ZATCA Compliance Notice:</strong>
              <p class="text-xs text-amber-200/90 font-mono mt-0.5">{{ zatcaResult.data.compliance.warning }}</p>
            </div>
          </div>

          <!-- Metadata Badges Grid -->
          <div v-if="zatcaResult.data?.invoice_id || zatcaResult.data?.invoice_counter || zatcaResult.data?.unit" class="grid grid-cols-3 gap-3">
            <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
              <span class="text-slate-500 text-[10px] font-semibold uppercase block">Invoice ID</span>
              <span class="text-white font-mono font-bold text-sm">{{ zatcaResult.data?.invoice_id ?? '—' }}</span>
            </div>
            <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
              <span class="text-slate-500 text-[10px] font-semibold uppercase block">Invoice Counter</span>
              <span class="text-cyan-400 font-mono font-bold text-sm">#{{ zatcaResult.data?.invoice_counter ?? '—' }}</span>
            </div>
            <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
              <span class="text-slate-500 text-[10px] font-semibold uppercase block">Unit Status</span>
              <span class="inline-flex items-center gap-1 text-emerald-400 font-medium text-xs mt-0.5">
                <span>●</span>
                <span class="capitalize">{{ zatcaResult.data?.unit?.status || 'Active' }}</span>
              </span>
            </div>
          </div>

          <!-- QR Code Preview & Download Link -->
          <div v-if="zatcaResult.data?.qr_url" class="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center gap-4">
            <div class="bg-white p-2.5 rounded-xl shadow-md border border-slate-700 shrink-0">
              <img :src="zatcaResult.data.qr_url" alt="ZATCA Phase 2 QR Code" class="w-28 h-28 object-contain" />
            </div>
            <div class="flex-1 flex flex-col gap-1.5 text-center md:text-left">
              <span class="text-slate-400 font-semibold text-xs flex items-center justify-center md:justify-start gap-1">
                <span>📱</span>
                <span>ZATCA Phase 2 QR Code</span>
              </span>
              <p class="text-[11px] text-slate-500 break-all font-mono">{{ zatcaResult.data.qr_url }}</p>
              <div class="mt-1 flex items-center justify-center md:justify-start gap-2">
                <button
                  @click="copyText(zatcaResult.data.qr_url, 'res-qr-url')"
                  class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 hover:text-white transition cursor-pointer"
                >
                  {{ copiedKey === 'res-qr-url' ? '✓ Copied URL' : 'Copy QR URL' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Invoice Hashes -->
          <div v-if="zatcaResult.data?.invoice_hash" class="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-slate-400 uppercase tracking-wider text-[10px] font-semibold flex items-center gap-1.5">
                <span>🔑</span>
                <span>Invoice Hash (SHA-256)</span>
              </span>
              <button
                @click="copyText(zatcaResult.data.invoice_hash, 'res-inv-hash')"
                class="text-cyan-400 hover:text-cyan-300 text-[11px] font-medium transition cursor-pointer"
              >
                {{ copiedKey === 'res-inv-hash' ? '✓ Copied!' : 'Copy Hash' }}
              </button>
            </div>
            <p class="font-mono text-[11px] text-cyan-300 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 break-all select-all">
              {{ zatcaResult.data.invoice_hash }}
            </p>
          </div>

          <div v-if="zatcaResult.data?.previous_invoice_hash" class="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-slate-400 uppercase tracking-wider text-[10px] font-semibold flex items-center gap-1.5">
                <span>🔗</span>
                <span>Previous Invoice Hash (Chain)</span>
              </span>
              <button
                @click="copyText(zatcaResult.data.previous_invoice_hash, 'res-prev-hash')"
                class="text-indigo-400 hover:text-indigo-300 text-[11px] font-medium transition cursor-pointer"
              >
                {{ copiedKey === 'res-prev-hash' ? '✓ Copied!' : 'Copy Hash' }}
              </button>
            </div>
            <p class="font-mono text-[11px] text-indigo-300 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 break-all select-all">
              {{ zatcaResult.data.previous_invoice_hash }}
            </p>
          </div>

          <!-- Collapsible Request Payload & Server Response for Debugging -->
          <details class="bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden group">
            <summary class="p-3 text-[11px] font-semibold text-slate-400 hover:text-slate-200 cursor-pointer select-none flex items-center justify-between">
              <span>View Sent JSON Payload ({{ zatcaResult.payload?.items?.length || 0 }} items)</span>
              <span class="text-xs group-open:rotate-180 transition">▼</span>
            </summary>
            <div class="p-3 border-t border-slate-800 bg-slate-950/90">
              <pre class="font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre">{{ JSON.stringify(zatcaResult.payload, null, 2) }}</pre>
            </div>
          </details>

          <details v-if="zatcaResult.data" class="bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden group">
            <summary class="p-3 text-[11px] font-semibold text-slate-400 hover:text-slate-200 cursor-pointer select-none flex items-center justify-between">
              <span>View Full Server Response</span>
              <span class="text-xs group-open:rotate-180 transition">▼</span>
            </summary>
            <div class="p-3 border-t border-slate-800 bg-slate-950/90">
              <pre class="font-mono text-[11px] text-emerald-300 overflow-x-auto whitespace-pre">{{ JSON.stringify(zatcaResult.data, null, 2) }}</pre>
            </div>
          </details>
        </div>

        <!-- Result Footer -->
        <div class="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            @click="fetchInvoices"
            class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5"
          >
            <span>🔄</span>
            <span>Refresh Invoice List</span>
          </button>
          <button
            @click="isZatcaModalOpen = false"
            class="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition shadow-lg shadow-cyan-600/25"
          >
            Done
          </button>
        </div>
      </div>
    </div>

    <!-- Page Footer -->
    <footer class="border-t border-slate-900 px-6 py-3 text-center text-xs text-slate-600 flex items-center justify-between">
      <span>Electron 45 • Vue 3 • Tailwind CSS</span>
      <span>Columns: Mdocnum, MtrxdateA, msupcusname, vatno, Invoice_qrcode, invoice_haskey</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

// Navigation & Screen View
const currentPage = ref('connection'); // 'connection' | 'invoices'

// Centralized Global Configuration Defaults
const DEFAULT_CONFIG = {
  connectionString: "Server=MASKAT\\SQLEXPRESS;Database=Unimarine;Trusted_Connection=True;Connection Timeout=30;",
  tableName: "masterTrx",
  zatcaApiBase: "http://10.105.114.65:8000/api",
  zatcaEndpoint: "http://10.105.114.65:8000/api/zatca/issue-invoice"
};

// Centralized Dynamic Connection Form State
const connectionString = ref(DEFAULT_CONFIG.connectionString);
const tableName = ref(DEFAULT_CONFIG.tableName);
const zatcaEndpoint = ref(DEFAULT_CONFIG.zatcaEndpoint);
const configFilePath = ref('');
const saveSuccessMsg = ref('');
const isSavingConfig = ref(false);
const activeDbName = ref('');
const isConnecting = ref(false);
const isConnected = ref(false);
const connectionError = ref('');

/**
 * Normalizes any ZATCA URL (base /api or full route) to the issue-invoice endpoint
 */
function resolveZatcaEndpoint(url) {
  const base = (url || DEFAULT_CONFIG.zatcaEndpoint).trim().replace(/\/+$/, '');
  return base.endsWith('/zatca/issue-invoice') ? base : `${base}/zatca/issue-invoice`;
}

// Invoices State
const invoices = ref([]);
const limit = ref(50);
const effectiveDate = ref('');
const searchQuery = ref('');
const filterTab = ref('all'); // 'all' | 'has_qr' | 'missing_qr'
const isLoadingInvoices = ref(false);
const invoiceError = ref('');
const lastUpdated = ref('');
const selectedInvoice = ref(null);
const copiedKey = ref(null);

// ZATCA Verification State
const verifyingDocnum = ref(null);
const zatcaResult = ref(null);
const isZatcaModalOpen = ref(false);

// Extract Database name from connection string dynamically using regex
const detectedDbName = computed(() => {
  const match = connectionString.value.match(/(?:Database|Initial Catalog)\s*=\s*([^;]+)/i);
  return match ? match[1].trim() : '';
});

// Badges and status pills
const statusBadgeClass = computed(() => {
  if (isConnected.value) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (connectionError.value) return 'bg-red-500/10 text-red-400 border-red-500/20';
  return 'bg-slate-800 text-slate-400 border-slate-700';
});

const statusDotClass = computed(() => {
  if (isConnected.value) return 'bg-emerald-400 animate-pulse';
  if (connectionError.value) return 'bg-red-400';
  return 'bg-slate-500';
});

const statusBadgeText = computed(() => {
  if (isConnecting.value) return 'Connecting...';
  if (isConnected.value) return `Connected: ${activeDbName.value || detectedDbName.value || 'OK'}`;
  return 'Disconnected';
});

// Reset to Default Centralized Preset
function resetToDefault() {
  connectionString.value = DEFAULT_CONFIG.connectionString;
  tableName.value = DEFAULT_CONFIG.tableName;
  zatcaEndpoint.value = DEFAULT_CONFIG.zatcaEndpoint;
}

// Saves configuration to disk without testing connection
async function handleSaveConfigOnly() {
  if (!window.electronAPI?.saveConfig) return;
  isSavingConfig.value = true;
  saveSuccessMsg.value = '';
  connectionError.value = '';

  try {
    const res = await window.electronAPI.saveConfig({
      connectionString: connectionString.value,
      tableName: tableName.value,
      zatcaEndpoint: resolveZatcaEndpoint(zatcaEndpoint.value)
    });

    if (res.success) {
      if (res.configFilePath) configFilePath.value = res.configFilePath;
      saveSuccessMsg.value = 'Settings saved to configuration file successfully!';
      setTimeout(() => {
        saveSuccessMsg.value = '';
      }, 4000);
    } else {
      connectionError.value = res.error || 'Failed to save configuration to file.';
    }
  } catch (err) {
    connectionError.value = err.message;
  } finally {
    isSavingConfig.value = false;
  }
}

// Opens the folder containing the configuration file
function openConfigFolder() {
  if (window.electronAPI?.openConfigFolder) {
    window.electronAPI.openConfigFolder();
  }
}

// Statistics
const stats = computed(() => {
  const withQr = invoices.value.filter(i => Boolean(i.INVOICE_QRCODE && String(i.INVOICE_QRCODE).trim())).length;
  return {
    withVat: invoices.value.filter(i => Boolean(i.vatno && String(i.vatno).trim())).length,
    withQr,
    missingQr: invoices.value.length - withQr,
    withHash: invoices.value.filter(i => Boolean(i.INVOICE_HASHKEY && String(i.INVOICE_HASHKEY).trim())).length
  };
});

// Filter invoices by Tab and Search Query
const filteredInvoices = computed(() => {
  let list = invoices.value;

  // Filter tab selection
  if (filterTab.value === 'has_qr') {
    list = list.filter(i => Boolean(i.INVOICE_QRCODE && String(i.INVOICE_QRCODE).trim()));
  } else if (filterTab.value === 'missing_qr') {
    list = list.filter(i => !i.INVOICE_QRCODE || !String(i.INVOICE_QRCODE).trim());
  }

  // Search query filter across all 6 columns
  if (!searchQuery.value.trim()) return list;
  const q = searchQuery.value.toLowerCase();
  return list.filter((row) =>
    [row.Mdocnum, row.MtrxdateA, row.MsupcusName, row.vatno, row.INVOICE_HASHKEY].some(
      (val) => String(val ?? '').toLowerCase().includes(q)
    )
  );
});

function truncate(str, len = 20) {
  if (!str) return '';
  const s = String(str);
  return s.length > len ? `${s.substring(0, len)}...` : s;
}

function openDetails(inv) {
  selectedInvoice.value = inv;
  copiedKey.value = null;
}

async function copyText(text, key) {
  try {
    await navigator.clipboard.writeText(String(text));
    copiedKey.value = key;
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy text', err);
  }
}

function minimizeToTray() {
  if (window.electronAPI?.minimizeToTray) {
    window.electronAPI.minimizeToTray();
  }
}

// ZATCA Issue-Invoice Verification Workflow
async function handleZatcaVerify(inv) {
  if (!inv || !inv.Mdocnum) return;
  if (verifyingDocnum.value) return;

  const docnum = inv.Mdocnum;
  verifyingDocnum.value = docnum;

  try {
    // 1. Fetch line items for this Mdocnum from MasterTrx
    // Selects Mtrxdate, MtrxdateA, SYSDATE, Mitemname, Outqty, Munitprice
    const itemsRes = await window.electronAPI.getInvoiceItems({
      docnum,
      connString: connectionString.value,
      tableName: tableName.value
    });

    if (!itemsRes.success || !itemsRes.rows || itemsRes.rows.length === 0) {
      throw new Error(itemsRes.error || `No line items found in table '${tableName.value}' for Mdocnum: ${docnum}`);
    }

    const rows = itemsRes.rows;
    const firstRow = rows[0];

    // 2. Extract Year, Date, and Time for invoice payload
    // Format of invoice number: INV-Year-Mdocnum, ex: INV-2026-00044
    let year = '2026';
    let dateStr = '2026-11-16';
    let timeStr = '12:00:00';

    const rawMtrxDate = firstRow.Mtrxdate || inv.MtrxdateA || '';
    const ymdMatch = String(rawMtrxDate).match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    const dmyMatch = String(rawMtrxDate).match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);

    if (ymdMatch) {
      year = ymdMatch[1];
      dateStr = `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
    } else if (dmyMatch) {
      year = dmyMatch[3];
      dateStr = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    // Time: check SYSDATE first, or non-midnight time in Mtrxdate, or current local time
    const rawSysDate = firstRow.SYSDATE || '';
    const timeMatch = String(rawSysDate).match(/(\d{2}:\d{2}:\d{2})/);
    if (timeMatch) {
      timeStr = timeMatch[1];
    } else {
      const mtrxTimeMatch = String(rawMtrxDate).match(/(\d{2}:\d{2}:\d{2})/);
      if (mtrxTimeMatch && mtrxTimeMatch[1] !== '00:00:00') {
        timeStr = mtrxTimeMatch[1];
      } else {
        timeStr = new Date().toTimeString().split(' ')[0];
      }
    }

    // Format invoice number: INV-Year-Mdocnum, ex: INV-2026-00044
    const cleanDoc = String(docnum).trim();
    const paddedDoc = cleanDoc.length < 5 ? cleanDoc.padStart(5, '0') : cleanDoc;
    const invoiceNumber = `INV-${year}-${paddedDoc}`;

    // 3. Format items: name, quantity, price, vat_percent=0.15
    const items = rows.map((r) => ({
      name: (r.Mitemname || 'Item').trim(),
      quantity: parseFloat(r.Outqty) || 1,
      price: parseFloat(r.Munitprice) || 0,
      vat_percent: 0.15
    }));

    // 4. Assemble payload
    const payload = {
      invoice: {
        number: invoiceNumber,
        date: dateStr,
        time: timeStr
      },
      items
    };

    console.log('🚀 [ZATCA] Sending invoice payload:', payload);

    // 5. Send to ZATCA Endpoint
    const res = await window.electronAPI.sendZatcaInvoice({
      payload,
      endpoint: zatcaEndpoint.value
    });

    console.log('📥 [ZATCA] Verification response:', res);

    // 6. Present Result in Modal
    zatcaResult.value = {
      success: res.success,
      docnum,
      invoiceNumber,
      payload,
      data: res.data || {},
      status: res.status,
      error: res.error,
      timestamp: new Date().toLocaleTimeString()
    };
    isZatcaModalOpen.value = true;
  } catch (err) {
    console.error('❌ [ZATCA] Verification error:', err);
    zatcaResult.value = {
      success: false,
      docnum,
      error: err.message,
      timestamp: new Date().toLocaleTimeString()
    };
    isZatcaModalOpen.value = true;
  } finally {
    verifyingDocnum.value = null;
  }
}

// Handle Form Submission: Test Connection and Open Invoices
async function handleConnect() {
  if (!window.electronAPI?.testDbConnection) return;
  isConnecting.value = true;
  connectionError.value = '';
  console.log('🔌 [JATCA] Connecting to SQL Server with:', connectionString.value);
  console.log('🎯 [JATCA] Target Table:', tableName.value);

  try {
    const res = await window.electronAPI.testDbConnection(connectionString.value);
    console.log('🔌 [JATCA] testDbConnection response:', res);
    if (res.success) {
      isConnected.value = true;
      activeDbName.value = res.database || detectedDbName.value || 'Unimarine';

      // Persist config
      const saveRes = await window.electronAPI.saveConfig({
        connectionString: connectionString.value,
        tableName: tableName.value,
        zatcaEndpoint: resolveZatcaEndpoint(zatcaEndpoint.value)
      });
      if (saveRes?.configFilePath) {
        configFilePath.value = saveRes.configFilePath;
      }

      // Switch to invoices view and fetch
      currentPage.value = 'invoices';
      await fetchInvoices();
    } else {
      isConnected.value = false;
      connectionError.value = res.error || 'Connection failed. Please check your SQL server and database name.';
      console.error('❌ [JATCA] Connection test failed:', res.error);
    }
  } catch (err) {
    isConnected.value = false;
    connectionError.value = err.message;
    console.error('❌ [JATCA] Connection exception:', err);
  } finally {
    isConnecting.value = false;
  }
}

// Fetch invoices directly from the database
async function fetchInvoices() {
  if (!window.electronAPI?.getInvoices) {
    invoiceError.value = 'Database API is unavailable.';
    return;
  }
  invoices.value = [];
  isLoadingInvoices.value = true;
  invoiceError.value = '';

  try {
    const res = await window.electronAPI.getInvoices({
      connString: connectionString.value,
      tableName: tableName.value,
      limit: limit.value
    });

    if (res.success) {
      effectiveDate.value = res.effectiveDate || '';
      // Map rows directly to the 6 target column names (with lowercase fallback)
      invoices.value = (res.rows || []).map((r) => ({
        Mdocnum: r.Mdocnum ?? r.mdocnum ?? '',
        MtrxdateA: r.MtrxdateA ?? r.mtrxdatea ?? '',
        MsupcusName: r.MsupcusName ?? r.msupcusname ?? '',
        vatno: r.vatno ?? r.VATNO ?? '',
        INVOICE_QRCODE: r.INVOICE_QRCODE ?? r.Invoice_qrcode ?? r.invoice_qrcode ?? '',
        INVOICE_HASHKEY: r.INVOICE_HASHKEY ?? r.invoice_haskey ?? r.invoice_hashkey ?? ''
      }));

      console.log('✅ Invoices loaded:', invoices.value);
      if (invoices.value.length > 0) {
        console.table(invoices.value);
      }
      lastUpdated.value = new Date().toLocaleTimeString();
    } else {
      invoiceError.value = res.error || `Error querying table "${tableName.value}".`;
      console.error('❌ SQL Query Error:', res.error);
    }
  } catch (err) {
    invoiceError.value = err.message;
    console.error('❌ fetchInvoices error:', err);
  } finally {
    isLoadingInvoices.value = false;
  }
}

// On App Load: Load saved config and attempt silent connect
onMounted(async () => {
  console.log('%c🧾 JATCA Invoice Processor Initialized', 'color: #06b6d4; font-size: 14px; font-weight: bold;');
  console.log('🔧 Electron API Available:', Boolean(window.electronAPI));

  if (window.electronAPI?.getConfig) {
    try {
      const cfg = await window.electronAPI.getConfig();
      if (cfg) {
        if (cfg.connectionString) connectionString.value = cfg.connectionString;
        if (cfg.tableName) tableName.value = cfg.tableName;
        if (cfg.zatcaEndpoint) zatcaEndpoint.value = cfg.zatcaEndpoint;
        if (cfg.configFilePath) configFilePath.value = cfg.configFilePath;
      }
    } catch (e) {
      console.error('Failed to load saved configuration:', e);
    }
  }

  // Automatically test connection on launch
  if (connectionString.value) {
    try {
      const res = await window.electronAPI.testDbConnection(connectionString.value);
      if (res.success) {
        isConnected.value = true;
        activeDbName.value = res.database || detectedDbName.value || 'Unimarine';
        currentPage.value = 'invoices';
        fetchInvoices();
      }
    } catch (e) {
      console.log('Initial connect deferred to manual submission:', e);
    }
  }
});
</script>
