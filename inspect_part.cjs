const { createClient } = require("@supabase/supabase-js");
const url = "https://argjmnsffrznpwswinka.supabase.co";
const key = "sb_publishable_Hl-mMWVY7ONNsVdwS_nfTw_gCnLEtzq";
const client = createClient(url, key);

async function inspectPart() {
  const pCode = "04-29-08-SHA76622KL-0040";
  
  // 1. Transactions
  const { data: txs, error: txErr } = await client
    .from("transactions")
    .select("*")
    .eq("part_code", pCode);
  console.log("=== TRANSACTIONS FOR PART ===");
  if (txErr) console.error("txErr:", txErr);
  else {
    txs.forEach(t => {
      console.log(`${t.id} | ${t.type} | ${t.quantity} | ${t.date} | ${t.location_id} | PO: ${t.production_order} | Reason: ${t.reason_or_purpose}`);
    });
  }

  // 2. Queue items in thekho_kitting_queue_v1
  const { data: queueRow, error: qErr } = await client
    .from("thekho_app_data")
    .select("data")
    .eq("key", "thekho_kitting_queue_v1")
    .single();
  const queue = queueRow?.data || [];
  const partQueue = queue.filter(q => (q.partCode || "").trim().toLowerCase() === pCode.toLowerCase());
  console.log("\n=== KITTING QUEUE ITEMS FOR PART (" + partQueue.length + " items) ===");
  partQueue.forEach(q => {
    console.log(`${q.id} | Status: ${q.status} | RawQty: ${q.rawQuantity} | KittedQty: ${q.kittedQuantity} | Voucher: ${q.voucherCode} | TxId: ${q.transactionId} | Date: ${q.createdAt}`);
  });

  // 3. Scan logs / completed items
  const { data: logsRow } = await client
    .from("thekho_app_data")
    .select("data")
    .eq("key", "thekho_kitting_scan_logs_v1")
    .single();
  const logs = logsRow?.data || [];
  const partLogs = logs.filter(l => (l.partCode || "").trim().toLowerCase() === pCode.toLowerCase());
  console.log("\n=== SCAN LOGS FOR PART (" + partLogs.length + " logs) ===");
  partLogs.forEach(l => {
    console.log(`${l.id} | Qty: ${l.quantity} | Scrap: ${l.scrapQuantity} | Time: ${l.timestamp} | Voucher: ${l.voucherCode}`);
  });
}

inspectPart().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
