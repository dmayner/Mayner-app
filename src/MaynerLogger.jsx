import React, { useState, useMemo } from "react";

// ─────────────────────────────────────────────────────────────
// Mayner Leadership — Client Session Logger
// Brand: #A73D36 (brick red) + white.
//
// The app's ONE job: log sessions and hold the client record.
// Make.com owns follow-up timing + sending. The app never sends email.
//
// SHEET COLUMNS (write map):
//   A Client Name        ⟵ add client
//   B Client First Name  ⟵ add client (used by email greeting in Make)
//   C Email              ⟵ add client
//   D Meeting cadence    ⟵ add client
//   E Last Session Date  ⟵ log session
//   F Follow-Up Days     ⟵ log session  (Make reads this to schedule)
//   G Session Notes      ⟵ log session
//   H Follow-Up Date     ✗ formula, never written by app
//   I Status             ⟵ set to "Pending" on log/add
//   J Last Email Sent    ✗ Make writes this after sending
//
// GO LIVE: the two spots marked  // ⟵ WIRE TO SHEET  POST to a Make.com
// webhook that writes the row. Everything else stays as-is.
// ─────────────────────────────────────────────────────────────

const BRAND = {
  red: "#A73D36", redDark: "#8A2F29", redSoft: "#F3E3E1",
  ink: "#1A1A1A", slate: "#6B6560", line: "#E7E2DF",
  paper: "#FAF8F7", white: "#FFFFFF", green: "#3E6B47",
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (iso) => { if (!iso) return "—"; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const fmtShort = (iso) => { if (!iso) return "—"; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };

const CADENCES = ["Weekly", "Biweekly", "Monthly"];

// ─────────────────────────────────────────────────────────────
// LIVE READ from the Google Sheet (published to web as CSV).
// The app fetches this on load to show the real client list.
// Note: Google caches this, so edits can take 1–2 min to appear on reload.
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRsAbFI3A6n5fSu0Uw3kPsLV4e7-b90_SI-6lOEDJHP9b7U5X8Zrv7ulfQZbYvyVobohljjBS6DFTPa/pub?gid=0&single=true&output=csv";

// Minimal CSV parser that handles quoted fields, commas, and newlines inside quotes.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\r") { /* skip */ }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else { field += ch; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Turn the sheet's rows into the client objects the app renders.
// Maps by header NAME so column order can shift without breaking.
function rowsToClients(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => headers.indexOf(name.toLowerCase());
  const iName = idx("Client Name");
  const iFirst = idx("Client First Name");
  const iEmail = idx("Email");
  const iCadence = idx("Meeting cadence");
  const iLast = idx("Last Session Date");
  const iDays = idx("Follow-Up Days");
  const iNotes = idx("Session Notes");
  const iStatus = idx("Status");
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = (iName >= 0 ? row[iName] : "").trim();
    const email = (iEmail >= 0 ? row[iEmail] : "").trim();
    if (!name && !email) continue; // skip blank rows
    out.push({
      id: `sheet-${r}`,
      name,
      first: (iFirst >= 0 ? row[iFirst] : "").trim() || name.split(" ")[0],
      email,
      cadence: (iCadence >= 0 ? row[iCadence] : "").trim() || "Weekly",
      lastSession: (iLast >= 0 ? row[iLast] : "").trim(),
      followUpDays: Number((iDays >= 0 ? row[iDays] : "").trim()) || 0,
      notes: (iNotes >= 0 ? row[iNotes] : "").trim(),
      status: (iStatus >= 0 ? row[iStatus] : "").trim() || "Pending",
    });
  }
  return out;
}

// Normalize date-ish strings from the sheet (e.g. "6/25/2026") to YYYY-MM-DD
// so the app's date helpers work. Leaves already-ISO or empty values alone.
function normalizeDate(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────
// LIVE WRITE to the Make.com webhook (routes on `mode`: add | log).
// To rotate it, replace this URL and redeploy.
const WEBHOOK_URL = "https://hook.us2.make.com/8wljybj1at4q9s9bckhx6x5979ywt2wy";

async function sendToSheet(payload) {
  try {
    const body = new URLSearchParams(payload).toString();
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}
// ─────────────────────────────────────────────────────────────

const emptyClient = { name: "", first: "", email: "", cadence: "Weekly", lastSession: todayISO(), followUpDays: 3, notes: "" };

function StatusDot({ status }) {
  const map = { Pending: BRAND.red, Sent: BRAND.green, Skip: BRAND.slate };
  const label = { Pending: "Follow-up scheduled", Sent: "Follow-up sent", Skip: "Skipped" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: BRAND.slate }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: map[status] || BRAND.slate }} />
      {label[status] || status}
    </span>
  );
}

export default function MaynerLogger() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState(null); // {mode:'log'|'add'|'edit', id?}
  const [form, setForm] = useState(emptyClient);
  const [toast, setToast] = useState("");

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  // Load the real client list from the published sheet on mount.
  const loadClients = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      // cache-bust so a manual refresh pulls the freshest published copy
      const res = await fetch(`${SHEET_CSV_URL}&t=${Date.now()}`);
      if (!res.ok) throw new Error("fetch failed");
      const text = await res.text();
      const parsed = rowsToClients(parseCSV(text)).map((c) => ({
        ...c,
        lastSession: normalizeDate(c.lastSession),
      }));
      setClients(parsed);
    } catch (e) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadClients(); }, [loadClients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) : clients;
    return [...list].sort((a, b) => (b.lastSession || "").localeCompare(a.lastSession || ""));
  }, [clients, query]);

  const openLog = (c) => { setForm({ ...emptyClient, ...c, lastSession: todayISO(), notes: "" }); setPanel({ mode: "log", id: c.id }); };
  const openAdd = () => { setForm(emptyClient); setPanel({ mode: "add" }); };
  const openEdit = (c) => { setForm({ ...c }); setPanel({ mode: "edit", id: c.id }); };
  const close = () => setPanel(null);

  const saveLog = async () => {
    // Update the screen immediately so it feels instant…
    setClients((prev) => prev.map((c) => c.id === panel.id
      ? { ...c, lastSession: form.lastSession, followUpDays: Number(form.followUpDays), notes: form.notes, status: "Pending" } : c));
    const who = form.first || form.name;
    close();
    // …then write to the sheet via Make (mode=log → Search Rows → Update a Row).
    const ok = await sendToSheet({
      mode: "log",
      name: form.name,
      first: form.first,
      email: form.email,
      cadence: form.cadence,
      sessionDate: form.lastSession,
      followUpDays: String(form.followUpDays),
      notes: form.notes,
    });
    flash(ok ? `Session logged for ${who}.` : `Saved on screen, but the sheet didn't confirm. Check connection.`);
  };

  const saveAdd = async () => {
    const id = `new-${Date.now()}`;
    const hasSession = form.notes.trim().length > 0;
    const first = form.first || form.name.split(" ")[0];
    setClients((prev) => [...prev, {
      id, name: form.name, first, email: form.email,
      cadence: form.cadence, lastSession: hasSession ? form.lastSession : "", followUpDays: Number(form.followUpDays),
      notes: form.notes, status: hasSession ? "Pending" : "Skip",
    }]);
    close();
    // Append a new row via Make (mode=add → Add a Row).
    const ok = await sendToSheet({
      mode: "add",
      name: form.name,
      first,
      email: form.email,
      cadence: form.cadence,
      sessionDate: hasSession ? form.lastSession : "",
      followUpDays: String(form.followUpDays),
      notes: form.notes,
    });
    flash(ok
      ? (hasSession ? `${first} added and first session logged.` : `${first} added.`)
      : `Added on screen, but the sheet didn't confirm. Check connection.`);
  };

  const saveEdit = () => {
    setClients((prev) => prev.map((c) => c.id === panel.id
      ? { ...c, name: form.name, first: form.first, email: form.email, cadence: form.cadence } : c));
    flash("Client details updated.");
    close();
  };

  const input = { width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${BRAND.line}`, fontSize: 14, fontFamily: "inherit" };
  const label = { display: "block", marginTop: 18, fontSize: 13, fontWeight: 700, color: BRAND.ink };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: BRAND.ink, background: BRAND.paper, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .display { font-family: 'Oswald', sans-serif; letter-spacing: .5px; }
        .btn { cursor: pointer; border: none; font-family: inherit; font-weight: 600; transition: background .15s ease, transform .15s ease; }
        .btn:focus-visible { outline: 3px solid ${BRAND.red}; outline-offset: 2px; }
        .card { transition: transform .15s ease, box-shadow .15s ease; }
        .card:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(167,61,54,.10); }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      {/* Header */}
      <header style={{ background: BRAND.red, color: BRAND.white }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="display" style={{ width: 44, height: 44, borderRadius: 8, background: BRAND.white, color: BRAND.red, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20 }}>ML</div>
            <div>
              <div className="display" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>MAYNER LEADERSHIP</div>
              <div style={{ fontSize: 12.5, opacity: .85, marginTop: 3, letterSpacing: .3 }}>Client Sessions &amp; Notes</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={loadClients} title="Reload from the sheet" style={{ background: "rgba(255,255,255,0.15)", color: BRAND.white, padding: "11px 16px", borderRadius: 9, fontSize: 14, border: "1px solid rgba(255,255,255,0.35)" }}>↻ Refresh</button>
            <button className="btn" onClick={openAdd} style={{ background: BRAND.white, color: BRAND.red, padding: "11px 18px", borderRadius: 9, fontSize: 14 }}>+ Add client</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 24px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
          <h1 className="display" style={{ fontSize: 27, margin: 0, fontWeight: 700 }}>Your clients</h1>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email"
            style={{ padding: "9px 14px", borderRadius: 9, border: `1.5px solid ${BRAND.line}`, fontSize: 14, fontFamily: "inherit", minWidth: 220, background: BRAND.white }} />
        </div>
        <p style={{ color: BRAND.slate, marginTop: 8, fontSize: 14.5, maxWidth: 640 }}>
          What you last covered, and when you last met. Log a session and the follow-up sends itself.
        </p>

        {loading && (
          <div style={{ textAlign: "center", padding: "56px 20px", color: BRAND.slate }}>
            <div className="display" style={{ fontSize: 18, color: BRAND.ink }}>Loading clients…</div>
            <p style={{ fontSize: 14, marginTop: 6 }}>Pulling the latest from your sheet.</p>
          </div>
        )}

        {loadError && !loading && (
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.line}`, borderLeft: `4px solid ${BRAND.red}`, borderRadius: 14, padding: "28px 24px", marginTop: 22 }}>
            <div className="display" style={{ fontSize: 18, color: BRAND.ink }}>Couldn't load the client list.</div>
            <p style={{ color: BRAND.slate, marginTop: 8, fontSize: 14, lineHeight: 1.55 }}>
              The app couldn't reach the published sheet. This is usually temporary. Click Refresh to try again. If it keeps happening, confirm the sheet is still published to the web (File → Share → Publish to web).
            </p>
            <button className="btn" onClick={loadClients} style={{ marginTop: 12, background: BRAND.red, color: BRAND.white, padding: "10px 16px", borderRadius: 9, fontSize: 14 }}>↻ Try again</button>
          </div>
        )}

        {!loading && !loadError && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, marginTop: 22 }}>
          {filtered.map((c) => (
            <div key={c.id} className="card" style={{ background: BRAND.white, border: `1px solid ${BRAND.line}`, borderRadius: 14, padding: "18px 18px 16px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div className="display" style={{ fontSize: 18, fontWeight: 700 }}>{c.name}</div>
                  <div style={{ fontSize: 12.5, color: BRAND.slate, marginTop: 2 }}>{c.cadence} · {c.email}</div>
                </div>
                <button className="btn" onClick={() => openEdit(c)} title="Edit details" style={{ background: "transparent", color: BRAND.slate, fontSize: 12.5, padding: "4px 6px", borderRadius: 6 }}>Edit</button>
              </div>

              <div style={{ margintop: 12, marginTop: 12, flex: 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: BRAND.slate, letterSpacing: .6, textTransform: "uppercase", marginBottom: 5 }}>Last discussed</div>
                <p style={{ fontSize: 13.5, color: "#443F3B", lineHeight: 1.5, margin: 0, background: BRAND.paper, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.line}`, minHeight: 66 }}>
                  {c.notes || <span style={{ color: BRAND.slate }}>No session logged yet.</span>}
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12.5, color: BRAND.slate }}>Last session: <strong style={{ color: BRAND.ink }}>{fmtShort(c.lastSession)}</strong></div>
                  <div style={{ marginTop: 4 }}><StatusDot status={c.status} /></div>
                </div>
                <button className="btn" onClick={() => openLog(c)} style={{ background: BRAND.red, color: BRAND.white, padding: "10px 15px", borderRadius: 9, fontSize: 13.5 }}
                  onMouseOver={(e) => (e.currentTarget.style.background = BRAND.redDark)} onMouseOut={(e) => (e.currentTarget.style.background = BRAND.red)}>
                  Log session
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.line}`, borderRadius: 14, padding: "44px 24px", textAlign: "center", marginTop: 22 }}>
            {query ? (
              <>
                <div className="display" style={{ fontSize: 19 }}>No clients match “{query}”.</div>
                <p style={{ color: BRAND.slate, marginTop: 8, fontSize: 14 }}>Clear the search, or add a new client.</p>
              </>
            ) : (
              <>
                <div className="display" style={{ fontSize: 19 }}>No clients yet.</div>
                <p style={{ color: BRAND.slate, marginTop: 8, fontSize: 14 }}>Add your first client to get started. They'll show up here and in your sheet.</p>
              </>
            )}
          </div>
        )}
        </div>
        )}
      </main>

      {/* Slide-out panel */}
      {panel && (
        <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,.45)", display: "flex", justifyContent: "flex-end", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 94vw)", background: BRAND.white, height: "100%", padding: "26px 24px", overflowY: "auto", boxShadow: "-12px 0 40px rgba(0,0,0,.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="display" style={{ fontSize: 20, fontWeight: 700 }}>
                {panel.mode === "log" ? "Log session" : panel.mode === "add" ? "Add client" : "Edit details"}
              </div>
              <button className="btn" onClick={close} style={{ background: "transparent", fontSize: 24, color: BRAND.slate, lineHeight: 1 }}>×</button>
            </div>

            {/* client identity fields — add + edit */}
            {(panel.mode === "add" || panel.mode === "edit") && (
              <>
                <label style={label}>Client name</label>
                <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
                <label style={label}>First name <span style={{ fontWeight: 400, color: BRAND.slate }}>· used in the email greeting</span></label>
                <input style={input} value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} placeholder="First name" />
                <label style={label}>Email</label>
                <input style={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="client@company.com" />
                <label style={label}>Meeting cadence</label>
                <select style={input} value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
                  {CADENCES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </>
            )}

            {/* session fields — log + (optional) add */}
            {(panel.mode === "log" || panel.mode === "add") && (
              <>
                {panel.mode === "add" && (
                  <div style={{ marginTop: 22, fontSize: 12.5, color: BRAND.slate, borderTop: `1px solid ${BRAND.line}`, paddingTop: 16 }}>
                    First session (optional) — add notes now to schedule their follow-up, or leave blank and log it later.
                  </div>
                )}
                {panel.mode === "log" && (
                  <div style={{ color: BRAND.slate, fontSize: 14, marginTop: 2 }}>{form.name} · {form.email}</div>
                )}
                <label style={label}>Session date</label>
                <input style={input} type="date" value={form.lastSession} onChange={(e) => setForm({ ...form, lastSession: e.target.value })} />

                <label style={label}>Session notes <span style={{ fontWeight: 400, color: BRAND.slate }}>· paste from Fathom</span></label>
                <textarea style={{ ...input, resize: "vertical", lineHeight: 1.5 }} rows={7} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="What did they work on? What did they commit to? What's the real tension?" />

                <label style={label}>Send follow-up in… (days)</label>
                <input style={input} type="number" min={0} max={60} value={form.followUpDays} onChange={(e) => setForm({ ...form, followUpDays: e.target.value })} />
                <div style={{ fontSize: 12.5, color: BRAND.slate, marginTop: 6 }}>
                  Writes to the sheet. The automation sends around {fmt(addDays(form.lastSession, Number(form.followUpDays || 0)))}.
                </div>
              </>
            )}

            <button className="btn" onClick={panel.mode === "log" ? saveLog : panel.mode === "add" ? saveAdd : saveEdit}
              disabled={(panel.mode !== "log") && !form.name.trim()}
              style={{ width: "100%", marginTop: 26, background: BRAND.red, color: BRAND.white, padding: "13px", borderRadius: 10, fontSize: 15, opacity: (panel.mode !== "log" && !form.name.trim()) ? .5 : 1 }}
              onMouseOver={(e) => { if (!(panel.mode !== "log" && !form.name.trim())) e.currentTarget.style.background = BRAND.redDark; }}
              onMouseOut={(e) => (e.currentTarget.style.background = BRAND.red)}>
              {panel.mode === "log" ? "Save session" : panel.mode === "add" ? "Add client" : "Save changes"}
            </button>
            {panel.mode !== "edit" && (
              <p style={{ fontSize: 12, color: BRAND.slate, marginTop: 12, lineHeight: 1.5 }}>
                The app records the session. The automation writes and sends the follow-up email on the scheduled day — you never touch the email.
              </p>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: BRAND.ink, color: BRAND.white, padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 60, boxShadow: "0 8px 30px rgba(0,0,0,.25)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
