// src/lib/metrics.js — V1's formulas, ported once and used by every page (V1 re-implemented them per page and they drifted).
// Pure functions over call rows; safe on server and client. Where V1 showed a hardcoded or random value, this returns the
// real number or null (the UI then shows an honest empty state).

export const kpiList = (c) => (Array.isArray(c?.kpi_results) ? c.kpi_results : []);
export const sopList = (c) => (Array.isArray(c?.sop_results) ? c.sop_results : []);
export const intel = (c) => (c?.intelligence && typeof c.intelligence === 'object' ? c.intelligence : {});
const low = (v) => String(v ?? '').toLowerCase();

export function kpi(c, name, id) {
  return kpiList(c).find((k) => (id && Number(k.kpi_id) === id) || low(k.name) === low(name) || (name && low(k.name).includes(low(name))));
}
export const kpiValue = (c, name, id) => kpi(c, name, id)?.value ?? null;

export const isProcessed = (c) => c.status === 'processed';

/** 0–5 quality (V1 normalizeCall: kpi_score > 5 is a 0–100 value → /20; quality_score 1–5 wins when present). */
export function quality(c) {
  if (c.quality_score != null && c.quality_score !== '' && Number(c.quality_score) <= 5) return Number(c.quality_score);
  const raw = c.kpi_score != null && c.kpi_score !== '' ? Number(c.kpi_score) : null;
  if (raw != null && Number.isFinite(raw)) return raw > 5 ? Number((raw / 20).toFixed(2)) : raw;
  const v = parseFloat(kpiValue(c, 'Call Quality Score', 6));
  return Number.isFinite(v) ? (v > 5 ? (v / 100) * 5 : v) : null;
}
export const qualityRounded = (c) => { const q = quality(c); return q == null ? null : Math.max(1, Math.min(5, Math.round(q))); };
/** SOP points out of 7: sop_score, else count of non-failed checkpoints. */
export function sopPoints(c) {
  if (c.sop_score != null && c.sop_score !== '') { const s = Number(c.sop_score); return s > 7 ? (s / 100) * 7 : s; }
  const l = sopList(c); return l.length ? l.filter((s) => ['pass', 'na', 'yes'].includes(low(s.result))).length : null;
}

export const coachingPriority = (c) => {
  const p = low(c.coaching_priority || intel(c).coaching_priority);
  if (p.includes('red')) return 'Red';
  if (p.includes('amber') || p.includes('yellow')) return 'Amber';
  if (p.includes('green')) return 'Green';
  const q = quality(c); if (q == null) return null;
  return q <= 2 ? 'Red' : q <= 3 ? 'Amber' : 'Green';
};
export const complianceRisk = (c) => { const v = low(c.compliance_risk || intel(c).compliance_risk); return v.includes('high') || v.includes('critical') ? 'High' : v.includes('medium') ? 'Medium' : v.includes('low') ? 'Low' : v ? 'None' : null; };
export const churnRisk = (c) => { const v = low(c.churn_risk || intel(c).churn_risk); return v.includes('high') ? 'High' : v.includes('medium') ? 'Medium' : v.includes('low') ? 'Low' : null; };
export const isZtp = (c) => /^(yes|true)$/i.test(String(c.ztp_violation ?? intel(c).ztp_violation ?? ''));
export const isHighRisk = (c) => complianceRisk(c) === 'High';

export function customerSentiment(c) {
  const s = low(c.sentiment || intel(c).sentiment);
  if (s.includes('pos')) return 'Positive'; if (s.includes('neg')) return 'Negative'; if (s.includes('neu')) return 'Neutral';
  const k = low(kpi(c, 'Customer & Agent Sentiment', 15)?.customer_sentiment);
  return k.includes('pos') ? 'Positive' : k.includes('neg') ? 'Negative' : k ? 'Neutral' : null;
}
export function agentSentiment(c) {
  const s = low(c.agent_sentiment || intel(c).agent_sentiment || kpi(c, 'Customer & Agent Sentiment', 15)?.agent_sentiment);
  if (!s) return null;
  if (s.includes('unprof')) return 'Unprofessional'; if (s.includes('prof')) return 'Professional'; return 'Neutral';
}
export const isResolved = (c) => intel(c).status === 'Resolved' || intel(c).resolution_status === 'Yes' || low(kpiValue(c, 'Call Resolution', 1)) === 'yes';
export const isFcr = (c) => intel(c).fcr === true || intel(c).fcr === 'Yes' || low(kpiValue(c, 'First Call Resolution', 2)) === 'yes';
export const csat = (c) => kpiValue(c, 'CSAT Indicator', 5) || intel(c).csat_indicator || intel(c).csat || null;
export const isRated = (c) => { const v = csat(c); return (v && low(v) !== 'na') || ['Positive', 'Negative', 'Neutral'].includes(customerSentiment(c)); };
export const isCsatPositive = (c) => low(csat(c)) === 'high' || customerSentiment(c) === 'Positive';
export const isCsatNegative = (c) => low(csat(c)) === 'low' || customerSentiment(c) === 'Negative';

export function classification(c) {
  const v = low(c.call_classification || intel(c).call_category || intel(c).call_classification || kpi(c, 'Call Intent', 11)?.call_classification);
  if (v.includes('intent') || v.includes('inquiry')) return 'Inquiry';
  if (v.includes('complaint')) return 'Complaint';
  if (v.includes('non-contact')) return 'Non-contact';
  if (v.includes('invalid')) return 'Invalid';
  return v ? 'Query' : null;
}
export const topic = (c) => c.call_intent || c.call_topic || intel(c).call_topic || intel(c).call_category || null;
export const subTopic = (c) => c.call_sub_topic || intel(c).call_sub_topic || null;
export const campaignOf = (c) => c.campaign || intel(c).campaign || null;
export function languageBucket(c) {
  const l = low(c.language || intel(c).language);
  if (!l) return null;
  if (l.includes('guj')) return 'Gujarati'; if (l.includes('mar')) return 'Marathi'; if (l.includes('hin')) return 'Hindi'; if (l.includes('eng')) return 'English';
  return 'Mixed';
}
export function seconds(c) {
  if (c.duration_seconds != null) return Number(c.duration_seconds);
  const d = String(c.duration || ''); if (!d) return null;
  const m = d.match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] * 60 + +m[2];
  const ms = d.match(/(\d+)\s*m\D+(\d+)\s*s/i); if (ms) return +ms[1] * 60 + +ms[2];
  const n = Number(d); return Number.isFinite(n) ? n : null;
}
export const fmtDuration = (s) => (s == null ? '—' : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);

/** Direction: the call's own value, then its campaign's direction, then the intent taxonomy (V1 InboundOutbound rule). */
export function direction(c, outboundIntents = []) {
  const d = low(c.direction || intel(c).direction);
  if (d.includes('out')) return 'Outbound'; if (d.includes('in')) return 'Inbound';
  return outboundIntents.includes(topic(c)) ? 'Outbound' : 'Inbound';
}

const avg = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
export { avg };
export const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

/** QA Health — V1 QAHealthCard: quality 35 + resolution 25 + compliance 15 + CSAT 25 (weights per organisation). */
export function qaHealth(calls, weights = { quality: 35, resolution: 25, compliance: 15, csat: 25 }) {
  const done = calls.filter(isProcessed);
  const n = done.length;
  if (!n) return null;
  const avgQ = avg(done.map(quality)) ?? 0;
  const res = done.filter(isResolved).length / n;
  const comp = done.filter((c) => !isHighRisk(c)).length / n;
  const rated = done.filter(isRated);
  const csatRate = rated.length ? rated.filter(isCsatPositive).length / rated.length : null;
  const parts = {
    quality: { value: avgQ, pts: (avgQ / 5) * weights.quality, max: weights.quality, label: `${avgQ.toFixed(2)}/5` },
    resolution: { value: res, pts: res * weights.resolution, max: weights.resolution, label: `${Math.round(res * 100)}%` },
    compliance: { value: comp, pts: comp * weights.compliance, max: weights.compliance, label: `${Math.round(comp * 100)}%` },
    csat: { value: csatRate, pts: csatRate == null ? null : csatRate * weights.csat, max: weights.csat, label: csatRate == null ? 'Not rated' : `${Math.round(csatRate * 100)}%` },
  };
  // when no call carries a rating, CSAT is left out and the score is re-based to 100 (V1 assumed 98%)
  const got = Object.values(parts).filter((p) => p.pts != null);
  const score = (got.reduce((a, p) => a + p.pts, 0) / got.reduce((a, p) => a + p.max, 0)) * 100;
  return { score: Math.round(score * 10) / 10, status: healthStatus(score), parts, calls: n, rated: rated.length };
}
export const healthStatus = (s) => (s == null ? null : s >= 80 ? 'Excellent' : s >= 60 ? 'Good' : s >= 45 ? 'Needs Attention' : 'Critical');

export function countBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (k == null || k === '') continue; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** SOP checkpoint pass / fail / NA from sop_results (V1's analytics page read kpi_results by mistake). */
export function sopBreakdown(calls) {
  const m = new Map();
  for (const c of calls.filter(isProcessed)) {
    for (const s of sopList(c)) {
      const key = s.name || `SOP ${s.sop_id}`;
      const e = m.get(key) || { name: key, id: Number(s.sop_id) || 99, pass: 0, fail: 0, na: 0 };
      const r = low(s.result);
      if (r === 'pass' || r === 'yes') e.pass++; else if (r === 'na' || r === 'n/a') e.na++; else e.fail++;
      m.set(key, e);
    }
  }
  return [...m.values()].sort((a, b) => a.id - b.id).map((e) => {
    const total = e.pass + e.fail + e.na; const evald = e.pass + e.fail;
    return { ...e, total, passRate: evald ? Math.round((e.pass / evald) * 100) : null, failPct: total ? Math.round((e.fail / total) * 100) : 0, naPct: total ? Math.round((e.na / total) * 100) : 0, passPct: total ? Math.round((e.pass / total) * 100) : 0 };
  });
}

/** Per-agent roll-up used by the leaderboard, compliance and training pages. */
export function agentStats(calls, agents = []) {
  const byCode = new Map();
  for (const c of calls.filter(isProcessed)) {
    const code = c.agent_code || 'Unknown';
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(c);
  }
  const names = new Map(agents.map((a) => [a.agent_code, a.agent_name]));
  const out = [];
  for (const [code, cs] of byCode) {
    const q = avg(cs.map(quality)); const s = avg(cs.map(sopPoints)); const emp = avg(cs.map((c) => Number(intel(c).empathy_score) || null));
    const pro = cs.filter((c) => agentSentiment(c) === 'Professional').length; const neu = cs.filter((c) => agentSentiment(c) === 'Neutral').length;
    const unpro = cs.filter((c) => agentSentiment(c) === 'Unprofessional').length; const sentN = pro + neu + unpro;
    const high = cs.filter(isHighRisk).length; const ztp = cs.filter(isZtp).length;
    const clean = cs.length ? (cs.length - high - ztp) / cs.length : null;
    const score = q == null ? null : Math.round((q / 5) * 100);
    out.push({
      code, name: names.get(code) || cs[0].agent_name || code, calls: cs.length, quality: q, sop: s, empathy: emp,
      resolution: pct(cs.filter(isResolved).length, cs.length), fcr: pct(cs.filter(isFcr).length, cs.length),
      avgSeconds: avg(cs.map(seconds)), score, status: score == null ? null : score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Critical',
      red: cs.filter((c) => coachingPriority(c) === 'Red').length, amber: cs.filter((c) => coachingPriority(c) === 'Amber').length,
      green: cs.filter((c) => coachingPriority(c) === 'Green').length, highRisk: high, ztp, churnHigh: cs.filter((c) => churnRisk(c) === 'High').length,
      clean: clean == null ? null : Math.round(clean * 100), monitor: clean != null && (clean < 0.75 || high > 0),
      pro, neu, unpro, sentimentScore: sentN ? Math.round((pro * 100 + neu * 50) / sentN) : null,
      positive: cs.filter((c) => customerSentiment(c) === 'Positive').length, negative: cs.filter((c) => customerSentiment(c) === 'Negative').length,
      neutral: cs.filter((c) => customerSentiment(c) === 'Neutral').length,
    });
  }
  return out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((a, i) => ({ ...a, rank: i + 1 }));
}

/** Knowledge gaps per agent: failed SOP checkpoints, KPI misses and recurring improvement areas (Agent Training module). */
export function knowledgeGaps(calls) {
  const gaps = new Map();
  const add = (key, area, c) => { const g = gaps.get(key) || { key, area, count: 0, calls: [] }; g.count++; if (g.calls.length < 20) g.calls.push(c.id); gaps.set(key, g); };
  for (const c of calls.filter(isProcessed)) {
    for (const s of sopList(c)) if (!['pass', 'yes', 'na', 'n/a'].includes(low(s.result))) add(`SOP: ${s.name}`, 'SOP', c);
    if (low(kpiValue(c, 'Call Resolution', 1)) === 'no') add('Resolution: query left unresolved', 'KPI', c);
    if (low(kpiValue(c, 'Process Adherence', 9)) === 'none') add('Process adherence: no structure', 'KPI', c);
    if (low(kpiValue(c, 'Hold Compliance', 7)) === 'non-compliant') add('Hold compliance', 'KPI', c);
    if (isZtp(c)) add('Compliance: ZTP violation', 'Compliance', c);
    if ((qualityRounded(c) ?? 5) < 4 && topic(c)) add(`Product knowledge: ${topic(c)}`, 'Topic', c);
  }
  return [...gaps.values()].sort((a, b) => b.count - a.count);
}

export function improvementThemes(calls) {
  const m = new Map();
  for (const c of calls.filter(isProcessed)) {
    for (const line of String(c.improvement_areas || '').split(/\n|;/)) {
      const t = line.replace(/^[-•*\d.)\s]+/, '').trim();
      if (t.length < 4) continue;
      const k = t.charAt(0).toUpperCase() + t.slice(1);
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** "What needs attention / what's working" — V1 DetailedAnalysis thresholds. */
export function attentionItems(calls) {
  const done = calls.filter(isProcessed);
  if (!done.length) return { attention: [], working: [] };
  const sops = sopBreakdown(done);
  const find = (frag) => sops.find((s) => low(s.name).includes(frag));
  const fail = (s) => (s && s.pass + s.fail ? Math.round((s.fail / (s.pass + s.fail)) * 100) : null);
  const fcr = pct(done.filter(isFcr).length, done.length);
  const q = avg(done.map(quality));
  const rules = [
    { key: 'fcr', bad: fcr != null && fcr < 80, badText: `First-call resolution is ${fcr}% (target 80%)`, goodText: `First-call resolution is ${fcr}%`, href: '/calls' },
    { key: 'greeting', s: find('greeting'), limit: 0, label: 'Greeting', href: '/analytics?tab=sop' },
    { key: 'identify', s: find('identif'), limit: 15, label: 'Caller identification', href: '/analytics?tab=sop' },
    { key: 'closing', s: find('closing'), limit: 0, label: 'Closing script', href: '/analytics?tab=sop' },
    { key: 'feedback', s: find('feedback'), limit: 0, label: 'Feedback IVR offer', href: '/analytics?tab=sop' },
    { key: 'behaviour', s: find('behaviour'), limit: 0, label: 'Agent behaviour (potential ZTP)', href: '/compliance' },
    { key: 'quality', bad: q != null && q < 4, badText: `Average quality is ${q?.toFixed(2)}/5 (target 4.0)`, goodText: `Average quality is ${q?.toFixed(2)}/5`, href: '/calls' },
  ];
  const attention = []; const working = [];
  for (const r of rules) {
    if (r.s !== undefined) {
      const f = fail(r.s); if (f == null) continue;
      (f > r.limit ? attention : working).push({ key: r.key, text: f > r.limit ? `${r.label} missed on ${f}% of evaluated calls` : `${r.label} followed on every evaluated call`, href: r.href });
    } else (r.bad ? attention : working).push({ key: r.key, text: r.bad ? r.badText : r.goodText, href: r.href });
  }
  const top = countBy(done, topic)[0];
  if (top) attention.push({ key: 'top', text: `Most common call type: ${top.name} (${pct(top.value, done.length)}% of calls)`, href: '/classification' });
  return { attention, working };
}

/** Daily series for trends (volume, quality, churn, compliance). */
export function dailySeries(calls) {
  const m = new Map();
  for (const c of calls.filter(isProcessed)) {
    const d = String(c.call_date || c.created_at || '').slice(0, 10); if (!d) continue;
    const e = m.get(d) || { date: d, calls: 0, q: [], highChurn: 0, lowChurn: 0, violations: 0, pos: 0, neu: 0, neg: 0 };
    e.calls++; e.q.push(quality(c));
    churnRisk(c) === 'High' ? e.highChurn++ : e.lowChurn++;
    if (isHighRisk(c) || isZtp(c)) e.violations++;
    const s = customerSentiment(c); if (s === 'Positive') e.pos++; else if (s === 'Negative') e.neg++; else if (s === 'Neutral') e.neu++;
    m.set(d, e);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({ ...e, quality: avg(e.q) == null ? null : Number(avg(e.q).toFixed(2)) }));
}

/** Weekly KPI history for an agent: clamp(round(avgQ×20), 0, 100); weeks with no calls are gaps, never synthesised. */
export function weeklySeries(calls, weeks = 12) {
  const now = new Date(); const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = new Date(now.getTime() - w * 7 * 86400000); const start = new Date(end.getTime() - 7 * 86400000);
    const cs = calls.filter((c) => { const d = new Date(c.call_date || c.created_at); return d > start && d <= end && isProcessed(c); });
    const q = avg(cs.map(quality)); const s = avg(cs.map(sopPoints));
    out.push({ week: `${start.getDate()} ${start.toLocaleString('en-GB', { month: 'short' })}`, kpi: q == null ? null : Math.round(q * 20), quality: q == null ? null : Number(q.toFixed(2)), sop: s == null ? null : Number(s.toFixed(1)), calls: cs.length });
  }
  return out;
}

/** Period filter (V1 global date filter; "Today" = calendar today, not "within 24 hours"). */
export function inPeriod(c, period, from, to) {
  if (!period || period === 'all') return true;
  const raw = c.call_date || c.created_at; if (!raw) return true;
  const d = new Date(String(raw).length === 10 ? `${raw}T12:00:00` : raw);
  const now = new Date(); const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return d >= startOfDay;
  if (period === '7d') return d >= new Date(startOfDay.getTime() - 6 * 86400000);
  if (period === '30d') return d >= new Date(startOfDay.getTime() - 29 * 86400000);
  if (period === 'month') return d >= new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'custom') {
    if (from && d < new Date(`${from}T00:00:00`)) return false;
    if (to && d > new Date(`${to}T23:59:59.999`)) return false;
    return true;
  }
  return true;
}

/** Display-layer PII masking (V1 piiMasker): PAN, Aadhaar, card, contextual account numbers, mobile numbers. */
export function maskPII(text) {
  if (!text) return '';
  return String(text)
    .replace(/\b([A-Z]{5})([0-9]{4})([A-Z])\b/gi, (_, a, b, c) => `${a.toUpperCase()}****${c.toUpperCase()}`)
    .replace(/\b(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})\b/g, (_, a, b, c, d) => `XXXX-XXXX-XXXX-${d}`)
    .replace(/\b(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})\b/g, (_, a, b, c) => `XXXX-XXXX-${c}`)
    .replace(/\b(folio|account|acc|policy|demat|mandate)\s*(?:no\.?|number|#)?\s*:?\s*([a-z0-9-]{6,20})\b/gi, (_, l, v) => `${l}: XXXX-${v.slice(-4)}`)
    .replace(/\b(?:\+91[-\s]?)?([6-9]\d{5})(\d{4})\b/g, (_, p, l4) => `XXXXXX${l4}`);
}
export const maskMobile = (m) => (m ? String(m).replace(/^(.*)(\d{4})$/, (_, a, b) => `${'X'.repeat(Math.min(6, a.length))}${b}`) : m);

/** Transcript lines → turns (Speaker 1 = agent, Speaker 2 = customer, as V1). */
export function transcriptTurns(t) {
  if (!t) return [];
  const text = typeof t === 'string' ? t : Array.isArray(t) ? t.map((x) => (typeof x === 'string' ? x : `${x.speaker}: ${x.text}`)).join('\n') : '';
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^([^:]{1,30}):\s*(.*)$/);
    if (!m) return { who: 'Note', text: line };
    const s = m[1].trim(); const who = /speaker\s*1|agent/i.test(s) ? 'Agent' : /speaker\s*2|customer|caller/i.test(s) ? 'Customer' : s;
    return { who, text: m[2] };
  });
}

/** CSV with quoting (V1 exportCsv). */
export function toCsv(rows, columns) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','))].join('\n');
}
