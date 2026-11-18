<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
    <!-- Top Navigation Bar -->
    <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <span class="text-xl">🧾</span>
        </div>
        <div>
          <h1 class="text-base font-bold text-white tracking-wide">JATCA Invoice Processor</h1>
          <p class="text-xs text-slate-400">Database: <span class="text-cyan-400 font-mono">Unimarine</span> • Table: <span class="text-indigo-400 font-mono">masterTrx</span></p>
        </div>
      </div>

      <!-- DB Status Badge -->
      <div class="flex items-center gap-3">
        <button
          @click="checkConnection"
          :disabled="isCheckingDb"
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer"
          :class="dbStatusClass"
        >
          <span class="w-2 h-2 rounded-full" :class="dbStatusDotClass"></span>
          <span>{{ dbStatusText }}</span>
        </button>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
      <!-- KPI / Stats Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col">
          <span class="text-xs text-slate-400">Total Invoices</span>
          <span class="text-2xl font-bold text-white mt-1">{{ invoices.length }}</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col">
          <span class="text-xs text-slate-400">With VAT No</span>
          <span class="text-2xl font-bold text-cyan-400 mt-1">{{ stats.withVat }}</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col">
          <span class="text-xs text-slate-400">With QR Code</span>
          <span class="text-2xl font-bold text-emerald-400 mt-1">{{ stats.withQr }}</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col">
          <span class="text-xs text-slate-400">With Hash Key</span>
          <span class="text-2xl font-bold text-indigo-400 mt-1">{{ stats.withHash }}</span>
        </div>
      </div>

      <!-- Action & Search Control Bar -->
      <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-3 flex-wrap">
          <button
            @click="fetchInvoices"
            :disabled="isLoading"
            class="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-semibold text-white shadow-lg shadow-cyan-600/30 flex items-center gap-2"
          >
            <svg v-if="isLoading" class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
            <span v-else>🔄</span>
            <span>{{ isLoading ? 'Loading...' : 'Fetch Invoices' }}</span>
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
      <div v-if="errorMessage" class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-xs text-red-400 flex items-start gap-3">
        <span class="text-base leading-none">⚠️</span>
        <div class="flex-1">
          <strong class="font-semibold block mb-1">SQL Error:</strong>
          <p class="font-mono break-all whitespace-pre-wrap">{{ errorMessage }}</p>
        </div>
        <button @click="errorMessage = ''" class="text-red-400 hover:text-red-200 text-sm">✕</button>
      </div>

      <!-- Invoices Table Section -->
      <div class="bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col flex-1">
        <!-- Table Subheader -->
        <div class="px-6 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-slate-200">Showing {{ filteredInvoices.length }} of {{ invoices.length }}</span>
            <span v-if="searchQuery" class="text-cyan-400">• Filter active</span>
          </div>
          <span v-if="lastUpdated">Updated: {{ lastUpdated }}</span>
        </div>

        <!-- Table View -->
        <div class="overflow-x-auto flex-1 max-h-[550px]">
          <table v-if="filteredInvoices.length > 0" class="w-full text-left text-xs text-slate-300">
            <thead class="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th class="py-3 px-4 font-semibold text-slate-500 w-12">#</th>
                <th class="py-3 px-4 font-semibold text-cyan-400">Doc #</th>
                <th class="py-3 px-4 font-semibold text-slate-300">Date</th>
                <th class="py-3 px-4 font-semibold text-slate-300">Customer Name</th>
                <th class="py-3 px-4 font-semibold text-slate-300">VAT No</th>
                <th class="py-3 px-4 font-semibold text-slate-300 text-center">QR Code</th>
                <th class="py-3 px-4 font-semibold text-slate-300">Hash Key</th>
                <th class="py-3 px-4 font-semibold text-slate-300 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60">
              <tr
                v-for="(inv, idx) in filteredInvoices"
                :key="inv.Doc || idx"
                class="hover:bg-slate-800/50 transition cursor-pointer"
                @click="openDetails(inv)"
              >
                <td class="py-3 px-4 text-slate-500 font-mono">{{ idx + 1 }}</td>
                <td class="py-3 px-4 font-mono font-bold text-cyan-400 whitespace-nowrap">
                  {{ inv.Doc || '—' }}
                </td>
                <td class="py-3 px-4 whitespace-nowrap text-slate-300 font-mono">
                  {{ inv.Date || '—' }}
                </td>
                <td class="py-3 px-4 font-medium text-white max-w-[220px] truncate" :title="inv.Name">
                  {{ inv.Name || '—' }}
                </td>
                <td class="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                  <span v-if="inv.Vat" class="bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded text-[11px]">
                    {{ inv.Vat }}
                  </span>
                  <span v-else class="text-slate-600">—</span>
                </td>
                <!-- QR Code Indicator -->
                <td class="py-3 px-4 text-center whitespace-nowrap">
                  <span
                    v-if="inv.Invoice_qrcode"
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  >
                    ✓ Available
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-500 border border-slate-700"
                  >
                    None
                  </span>
                </td>
                <!-- Hash Key -->
                <td class="py-3 px-4 font-mono text-slate-400 whitespace-nowrap max-w-[160px] truncate">
                  <span v-if="inv.invoice_haskey" class="text-indigo-300 text-[11px]" :title="inv.invoice_haskey">
                    {{ truncate(inv.invoice_haskey, 16) }}
                  </span>
                  <span v-else class="text-slate-600">—</span>
                </td>
                <!-- Action Button -->
                <td class="py-3 px-4 text-right whitespace-nowrap">
                  <button
                    @click.stop="openDetails(inv)"
                    class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs text-slate-300 hover:text-white transition"
                  >
                    View
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Empty State -->
          <div v-else-if="!isLoading" class="p-16 text-center text-slate-500 flex flex-col items-center justify-center">
            <span class="text-4xl mb-3">📁</span>
            <p class="text-sm font-medium text-slate-400">No invoices to display</p>
            <p class="text-xs mt-1 text-slate-500">Click "Fetch Invoices" to load records from masterTrx.</p>
          </div>

          <!-- Loading State -->
          <div v-else class="p-16 text-center text-slate-400 flex flex-col items-center justify-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mb-3"></div>
            <p class="text-sm font-medium">Querying masterTrx from MASKAT\SQLEXPRESS...</p>
          </div>
        </div>
      </div>
    </main>

    <!-- Invoice Detail Modal -->
    <div
      v-if="selectedInvoice"
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="selectedInvoice = null"
    >
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div>
            <h3 class="text-base font-bold text-white">Invoice #{{ selectedInvoice.Doc }}</h3>
            <p class="text-xs text-slate-400">Date: {{ selectedInvoice.Date }}</p>
          </div>
          <button
            @click="selectedInvoice = null"
            class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <!-- Modal Body -->
        <div class="p-6 overflow-y-auto flex flex-col gap-5 text-xs text-slate-300">
          <!-- Customer & Vat -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold block mb-1">Customer Name</span>
              <span class="text-white font-medium text-sm">{{ selectedInvoice.Name || '—' }}</span>
            </div>
            <div class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold block mb-1">VAT Number</span>
              <span class="font-mono text-cyan-400 font-semibold text-sm">{{ selectedInvoice.Vat || '—' }}</span>
            </div>
          </div>

          <!-- Hash Key -->
          <div class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">Invoice Hash Key (invoice_haskey)</span>
              <button
                v-if="selectedInvoice.invoice_haskey"
                @click="copyText(selectedInvoice.invoice_haskey, 'hash')"
                class="text-indigo-400 hover:text-indigo-300 text-[11px] font-medium"
              >
                {{ copiedKey === 'hash' ? '✓ Copied' : 'Copy Hash' }}
              </button>
            </div>
            <p class="font-mono text-[11px] text-indigo-300 break-all bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
              {{ selectedInvoice.invoice_haskey || 'No hash key available' }}
            </p>
          </div>

          <!-- QR Code Data -->
          <div class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">JATCA QR Code (Invoice_qrcode)</span>
              <button
                v-if="selectedInvoice.Invoice_qrcode"
                @click="copyText(selectedInvoice.Invoice_qrcode, 'qr')"
                class="text-cyan-400 hover:text-cyan-300 text-[11px] font-medium"
              >
                {{ copiedKey === 'qr' ? '✓ Copied' : 'Copy QR String' }}
              </button>
            </div>
            <p class="font-mono text-[11px] text-cyan-300 break-all bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 max-h-36 overflow-y-auto">
              {{ selectedInvoice.Invoice_qrcode || 'No QR code string available' }}
            </p>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            @click="selectedInvoice = null"
            class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Page Footer -->
    <footer class="border-t border-slate-900 px-6 py-3 text-center text-xs text-slate-600 flex items-center justify-between">
      <span>Electron 45 • Vue 3 • Tailwind CSS</span>
      <span>Columns: Name, Date, Doc, Vat, Invoice_qrcode, invoice_haskey</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const invoices = ref([]);
const limit = ref(50);
const searchQuery = ref('');
const isLoading = ref(false);
const isCheckingDb = ref(false);
const dbStatus = ref('idle'); // 'idle' | 'connected' | 'error'
const errorMessage = ref('');
const lastUpdated = ref('');
const selectedInvoice = ref(null);
const copiedKey = ref(null);

// Statistics computed from loaded invoices
const stats = computed(() => {
  return {
    withVat: invoices.value.filter(i => Boolean(i.Vat && String(i.Vat).trim())).length,
    withQr: invoices.value.filter(i => Boolean(i.Invoice_qrcode && String(i.Invoice_qrcode).trim())).length,
    withHash: invoices.value.filter(i => Boolean(i.invoice_haskey && String(i.invoice_haskey).trim())).length
  };
});

// Search filter across all columns
const filteredInvoices = computed(() => {
  if (!searchQuery.value.trim()) return invoices.value;
  const q = searchQuery.value.toLowerCase();
  return invoices.value.filter((row) =>
    Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q))
  );
});

// Database badge styles
const dbStatusClass = computed(() => {
  if (dbStatus.value === 'connected') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (dbStatus.value === 'error') return 'bg-red-500/10 text-red-400 border-red-500/20';
  return 'bg-slate-800 text-slate-400 border-slate-700';
});

const dbStatusDotClass = computed(() => {
  if (dbStatus.value === 'connected') return 'bg-emerald-400 animate-pulse';
  if (dbStatus.value === 'error') return 'bg-red-400';
  return 'bg-slate-500';
});

const dbStatusText = computed(() => {
  if (isCheckingDb.value) return 'Testing Connection...';
  if (dbStatus.value === 'connected') return 'Connected (Unimarine)';
  if (dbStatus.value === 'error') return 'Connection Error';
  return 'Test DB Connection';
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

// Test database connection
async function checkConnection() {
  if (!window.electronAPI?.testDbConnection) return;
  isCheckingDb.value = true;
  errorMessage.value = '';
  try {
    const res = await window.electronAPI.testDbConnection();
    if (res.success) {
      dbStatus.value = 'connected';
    } else {
      dbStatus.value = 'error';
      errorMessage.value = res.error || 'Failed to connect to database.';
    }
  } catch (err) {
    dbStatus.value = 'error';
    errorMessage.value = err.message;
  } finally {
    isCheckingDb.value = false;
  }
}

// Fetch invoices with specific columns
async function fetchInvoices() {
  if (!window.electronAPI?.getInvoices) {
    errorMessage.value = 'electronAPI.getInvoices is not available in preload script.';
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await window.electronAPI.getInvoices(limit.value);
    if (res.success) {
      invoices.value = res.rows || [];
      dbStatus.value = 'connected';
      lastUpdated.value = new Date().toLocaleTimeString();
    } else {
      errorMessage.value = res.error || 'Error fetching records from masterTrx.';
      dbStatus.value = 'error';
    }
  } catch (err) {
    errorMessage.value = err.message;
    dbStatus.value = 'error';
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  checkConnection();
});
</script>
