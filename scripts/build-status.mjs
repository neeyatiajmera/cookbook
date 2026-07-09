// Generates a static status.html snapshot of the whole pipeline.
// Runs inside the Pages build workflow (secrets available), rebuilt on every
// content push and every 30 minutes by cron.
import { writeFileSync } from "node:fs";

const GH = process.env.CONTENT_GITHUB_TOKEN;
const CB = "neeyatiajmera/cookbook";
const APP = "neeyatiajmera/cookgit-app";

const ghH = { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "status" };
const j = (u, h) => fetch(u, { headers: h }).then((r) => r.json());
const safe = async (fn) => { try { return { ok: true, d: await fn() }; } catch (e) { return { ok: false, e: String(e).slice(0, 160) }; } };

const [webhook, redis, commits, ci, deploys, pages] = await Promise.all([
  safe(async () => {
    const r = await j(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    if (!r.ok) throw new Error(r.description);
    return r.result;
  }),
  safe(async () => {
    const r = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      body: JSON.stringify(["PING"]),
    }).then((x) => x.json());
    if (r.error) throw new Error(r.error);
    const d = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      body: JSON.stringify(["EXISTS", `draft:${process.env.TELEGRAM_OWNER_ID}`]),
    }).then((x) => x.json());
    return { pong: r.result, draft: d.result === 1 };
  }),
  safe(async () => (await j(`https://api.github.com/repos/${CB}/commits?per_page=5`, ghH))
    .map((c) => ({ m: c.commit.message.split("\n")[0], d: c.commit.committer?.date, u: c.html_url }))),
  safe(async () => (await j(`https://api.github.com/repos/${CB}/actions/workflows/validate-and-deploy.yml/runs?per_page=3`, ghH))
    .workflow_runs.map((r) => ({ s: r.status, c: r.conclusion, d: r.created_at, u: r.html_url }))),
  safe(async () => (await j(`https://api.github.com/repos/${APP}/actions/workflows/deploy.yml/runs?per_page=2`, ghH))
    .workflow_runs.map((r) => ({ s: r.status, c: r.conclusion, d: r.created_at, u: r.html_url, ev: r.event }))),
  safe(async () => (await j(`https://api.github.com/repos/${CB}/actions/workflows/pages.yml/runs?per_page=5`, ghH))
    .workflow_runs.filter((r) => String(r.id) !== String(process.env.GITHUB_RUN_ID || ""))
    .slice(0, 3).map((r) => ({ s: r.status, c: r.conclusion, d: r.created_at, u: r.html_url }))),
]);

const rel = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const dot = (s) => `<span class="dot ${s}"></span>`;
const runDot = (r) => (r.s !== "completed" ? "warn" : r.c === "success" ? "ok" : "fail");
const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");

const whDot = !webhook.ok ? "fail"
  : webhook.d.last_error_message && webhook.d.last_error_date * 1000 > Date.now() - 3600e3 ? "warn" : "ok";

const stage = (n, title, d, body) => `
<section class="card"><div class="head"><span class="n">${n}</span><h2>${title}</h2>${dot(d)}</div>${body}</section>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Kitchen status · neosCookBook</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Karla:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--paper:#FDFBF7;--ink:#2A2521;--faded:#6E6357;--herb:#41633A;--pap:#B4543A;--line:#E8E1D3;--cream:#F5EFE3}
body{background:var(--paper);color:var(--ink);font-family:Karla,sans-serif;margin:0;padding:32px 20px;line-height:1.5}
main{max-width:760px;margin:0 auto}h1{font-family:Fraunces,serif;font-weight:500;font-size:2.4rem;margin:.2em 0}
h2{font-size:1.05rem;margin:0;flex:1}.eyebrow{letter-spacing:.2em;text-transform:uppercase;font-weight:700;font-size:.75rem;color:var(--herb)}
.sub{color:var(--faded);margin-bottom:28px}.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 2px rgba(42,37,33,.05)}
.head{display:flex;align-items:center;gap:12px;margin-bottom:8px}.n{font-family:Fraunces,serif;color:var(--faded)}
.dot{width:11px;height:11px;border-radius:99px;display:inline-block}.ok{background:var(--herb)}.warn{background:#D69E2E}.fail{background:var(--pap)}.unknown{background:#c8c0b2}
ul{margin:6px 0;padding-left:0;list-style:none}li{margin:3px 0;font-size:.92rem}a{color:inherit}
code{background:var(--cream);padding:2px 6px;border-radius:6px;font-size:.85em}
.err{color:var(--pap)}.legend{background:var(--cream);border:1px solid var(--line);border-radius:16px;padding:16px 20px;font-size:.9rem;color:var(--faded)}
.faded{color:var(--faded)}</style></head><body><main>
<p class="eyebrow">Pipeline</p><h1>Kitchen status</h1>
<p class="sub">Telegram → AI → git → CI → site. Snapshot generated ${new Date().toUTCString()} — auto-refreshes on every pipeline event and every 30 min.</p>

${stage(1, "Telegram webhook (the bot’s front door)", whDot, webhook.ok ? `
  <ul><li>Registered at <code>${esc(webhook.d.url) || "—"}</code></li>
  <li>Pending updates: <b>${webhook.d.pending_update_count}</b></li>
  ${webhook.d.last_error_message ? `<li class="err">Last delivery error (${rel(webhook.d.last_error_date * 1000)}): ${esc(webhook.d.last_error_message)}</li>` : ""}</ul>`
  : `<p class="err">${esc(webhook.e)}</p>`)}

${stage(2, "Redis (drafts & dedupe)", redis.ok ? "ok" : "fail", redis.ok
  ? `<ul><li>Ping: <b>${esc(redis.d.pong)}</b></li><li>${redis.d.draft ? "✏️ Unsaved draft waiting in Telegram" : "No pending draft"}</li></ul>`
  : `<p class="err">${esc(redis.e)} — Save will fail until this is green.</p>`)}

${stage(3, "Cookbook repo (source of truth)", commits.ok ? "ok" : "fail", commits.ok
  ? `<ul>${commits.d.map((c) => `<li><span class="faded">${rel(c.d)}</span> · <a href="${c.u}">${esc(c.m)}</a></li>`).join("")}</ul>`
  : `<p class="err">${esc(commits.e)}</p>`)}

${stage(4, "CI validation (schema check)", ci.ok && ci.d[0] ? runDot(ci.d[0]) : "unknown", ci.ok
  ? `<ul>${ci.d.map((r) => `<li>${dot(runDot(r))} <a href="${r.u}">${rel(r.d)} — ${r.s}${r.c ? " / " + r.c : ""}</a></li>`).join("")}</ul>`
  : `<p class="err">${esc(ci.e)}</p>`)}

${stage(5, "Website publish (GitHub Pages)", pages.ok && pages.d[0] ? runDot(pages.d[0]) : "unknown", pages.ok
  ? `<ul>${pages.d.map((r) => `<li>${dot(runDot(r))} <a href="${r.u}">${rel(r.d)} — ${r.s}${r.c ? " / " + r.c : ""}</a></li>`).join("")}</ul>`
  : `<p class="err">${esc(pages.e)}</p>`)}

${stage(6, "Vercel deploys (bot host — parked)", deploys.ok && deploys.d[0] && deploys.d[0].c === "success" ? "ok" : "unknown", deploys.ok
  ? `<ul>${deploys.d.map((r) => `<li>${dot(runDot(r))} <a href="${r.u}">${rel(r.d)} — via ${r.ev} — ${r.s}${r.c ? " / " + r.c : ""}</a></li>`).join("")}</ul>
     <p class="faded">Parked until the Vercel account is verified — the bot keeps running on its last healthy deployment, and this lane does not affect publishing. Gray here is normal.</p>`
  : `<p class="err">${esc(deploys.e)}</p>`)}

<div class="legend"><b style="color:var(--ink)">Reading this page</b><br>
This page is rebuilt with the site, so if you can see a fresh timestamp above, stages 3→5 just ran. 🟢 1+2 green = the bot will answer and Save will work. 🔴 stage 1 with a delivery error = Telegram can’t reach the bot. 🟡 anywhere = something’s in flight; click through to the run.
</div></main></body></html>`;

writeFileSync(process.argv[2] || "status.html", html);
console.log("status.html written");
