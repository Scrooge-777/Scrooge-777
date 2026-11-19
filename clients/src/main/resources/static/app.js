// CertVerify web portal. Talks to this node's REST API (/api/...).
"use strict";

const $ = (sel) => document.querySelector(sel);
const state = { me: null, role: "verifier", peers: [], issueHash: "", verifyHash: "" };

// ---------- helpers ----------
async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 4500);
}

/** SHA-256 of a file, computed locally in the browser (Web Crypto API). */
async function sha256Hex(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function roleOf(org) {
  const o = org.toLowerCase();
  if (o.includes("university") || o.includes("college") || o.includes("institute")) return "university";
  if (o.includes("student")) return "student";
  return "verifier";
}

function short(name) {
  const m = /O=([^,]+)/.exec(name);
  return m ? m[1] : name;
}

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + name));
  if (name === "vault") loadCertificates();
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

// ---------- identity & peers ----------
async function init() {
  try {
    state.me = await api("/me");
    state.role = roleOf(state.me.organisation);
    $("#node").classList.add("online");
    $("#nodeName").textContent = state.me.organisation;
    $("#nodeRole").textContent = state.role;
    document.title = `${state.me.organisation} · CertVerify`;
  } catch (e) {
    $("#nodeName").textContent = "Node unreachable";
    toast(e.message, true);
    return;
  }

  state.peers = await api("/peers").catch(() => []);
  const options = (filter) =>
    state.peers.filter((p) => filter(roleOf(p.organisation)))
      .map((p) => `<option value="${esc(p.name)}">${esc(p.organisation)}</option>`).join("");

  $("#studentSelect").innerHTML = options((r) => r !== "university") || `<option value="">No peers found</option>`;
  const universities = state.peers.filter((p) => roleOf(p.organisation) === "university");
  if (state.role === "university") universities.unshift({ name: state.me.name, organisation: state.me.organisation });
  $("#universitySelect").innerHTML = universities
    .map((p) => `<option value="${esc(p.name)}">${esc(p.organisation)}</option>`).join("")
    || `<option value="">No universities found</option>`;

  // Hide the Issue tab for non-universities; open the most useful tab per role.
  document.querySelector('[data-tab="issue"]').hidden = state.role !== "university";
  const hints = {
    university: "Certificates this university has issued. You can revoke them and view their history.",
    student: "Certificates issued to you. Share one with an employer so they can verify it on the ledger.",
    verifier: "Certificates candidates have shared with you. Each was cryptographically checked on receipt.",
  };
  $("#vaultHint").textContent = hints[state.role];
  showTab(state.role === "verifier" ? "verify" : "vault");
}

// ---------- certificate list ----------
async function loadCertificates() {
  const list = $("#certList");
  try {
    const certs = await api("/certificates");
    if (!certs.length) {
      list.innerHTML = `<div class="empty">No certificates in this vault yet.</div>`;
      return;
    }
    list.innerHTML = certs.map(renderCert).join("");
  } catch (e) {
    list.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function renderCert(c) {
  const revoked = c.status === "REVOKED";
  const relation = { ISSUED_BY_ME: "Issued by you", HELD_BY_ME: "Your certificate", SHARED_WITH_ME: "Shared with you" }[c.relationship];
  const verifiers = state.peers.filter((p) => roleOf(p.organisation) === "verifier");
  const canShare = c.relationship === "HELD_BY_ME" && !revoked && verifiers.length;
  const canRevoke = c.relationship === "ISSUED_BY_ME" && !revoked;

  return `
  <article class="cert ${revoked ? "revoked" : ""}" data-id="${esc(c.certificateId)}">
    <div class="cert-top">
      <div>
        <div class="cert-title">${esc(c.program)} · ${esc(c.specialization)}</div>
        <div class="cert-meta">${esc(c.studentName)} · ${esc(c.rollNumber)} · ${esc(short(c.university))}</div>
      </div>
      <div class="actions">
        <span class="badge info">${esc(relation)}</span>
        <span class="badge ${revoked ? "bad" : "ok"}">${esc(c.status)}</span>
      </div>
    </div>
    <div class="facts">
      <div><span>Certificate no.</span>${esc(c.certificateId)}</div>
      <div><span>CGPA</span>${Number(c.cgpa).toFixed(2)}</div>
      <div><span>Year of passing</span>${esc(c.yearOfPassing)}</div>
      <div><span>Issued on</span>${esc(c.issueDate)}</div>
      ${revoked ? `<div><span>Revocation reason</span>${esc(c.revocationReason)}</div>` : ""}
    </div>
    <div class="facts"><div><span>Document SHA-256</span><code class="hash">${esc(c.documentHash)}</code></div></div>
    <div class="actions">
      <button class="btn ghost small" data-action="history">History</button>
      ${canShare ? `
        <select class="share-to">${verifiers.map((p) => `<option value="${esc(p.name)}">${esc(p.organisation)}</option>`).join("")}</select>
        <button class="btn primary small" data-action="share">Share</button>` : ""}
      ${canRevoke ? `<button class="btn danger small" data-action="revoke">Revoke</button>` : ""}
    </div>
  </article>`;
}

$("#certList").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-action]");
  if (!btn) return;
  const card = btn.closest(".cert");
  const id = card.dataset.id;
  const action = btn.dataset.action;
  btn.disabled = true;
  try {
    if (action === "history") await showHistory(id);
    if (action === "share") {
      const verifier = card.querySelector(".share-to").value;
      const res = await api(`/certificates/${encodeURIComponent(id)}/share`, { method: "POST", body: JSON.stringify({ verifier }) });
      toast(res.message);
    }
    if (action === "revoke") {
      const reason = prompt(`Reason for revoking ${id}:`);
      if (reason && reason.trim()) {
        const res = await api(`/certificates/${encodeURIComponent(id)}/revoke`, { method: "POST", body: JSON.stringify({ reason }) });
        toast(res.message);
        await loadCertificates();
      }
    }
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
});

$("#refresh").addEventListener("click", loadCertificates);

async function showHistory(id) {
  const versions = await api(`/certificates/${encodeURIComponent(id)}/history`);
  $("#historyTitle").textContent = `History of ${id}`;
  $("#historyList").innerHTML = versions.map((v) => `
    <li>
      <strong>${esc(v.status)}</strong> · ${esc(v.recordedAt ? new Date(v.recordedAt).toLocaleString() : "")}
      ${v.revocationReason ? `<div>Reason: ${esc(v.revocationReason)}</div>` : ""}
      <div class="mono">tx ${esc(v.transactionId)}</div>
    </li>`).join("");
  $("#historyDialog").showModal();
}
$("#closeHistory").addEventListener("click", () => $("#historyDialog").close());

// ---------- issue ----------
$("#issueFile").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  state.issueHash = file ? await sha256Hex(file) : "";
  $("#issueHash").textContent = state.issueHash || "No file selected";
});

$("#issueForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!state.issueHash) return toast("Choose the certificate document first.", true);
  const form = new FormData(ev.target);
  const payload = Object.fromEntries(form.entries());
  payload.cgpa = parseFloat(payload.cgpa);
  payload.yearOfPassing = parseInt(payload.yearOfPassing, 10);
  payload.documentHash = state.issueHash;

  const button = ev.target.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Notarising…";
  try {
    const res = await api("/certificates", { method: "POST", body: JSON.stringify(payload) });
    toast(`${res.message} Tx ${res.transactionId.slice(0, 12)}…`);
    ev.target.reset();
    state.issueHash = "";
    $("#issueHash").textContent = "No file selected";
  } catch (e) {
    toast(e.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Issue on ledger";
  }
});

// ---------- verify ----------
$("#verifyFile").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  state.verifyHash = file ? await sha256Hex(file) : "";
  $("#verifyHash").textContent = state.verifyHash || "No file selected — status check only";
});

$("#verifyForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = new FormData(ev.target);
  const payload = {
    certificateId: form.get("certificateId"),
    university: form.get("university"),
    documentHash: state.verifyHash,
  };
  const button = ev.target.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    renderVerification(await api("/verify", { method: "POST", body: JSON.stringify(payload) }));
  } catch (e) {
    $("#verifyResult").innerHTML = "";
    toast(e.message, true);
  } finally {
    button.disabled = false;
  }
});

function renderVerification(r) {
  const titles = {
    VALID: "✓ Genuine and valid",
    REVOKED: "✕ Revoked",
    HASH_MISMATCH: "✕ Document does not match",
    NOT_FOUND: "? No such certificate",
  };
  const details = r.detailsDisclosed ? `
    <div class="facts">
      <div><span>Student</span>${esc(r.studentName)}</div>
      <div><span>Roll number</span>${esc(r.rollNumber)}</div>
      <div><span>Program</span>${esc(r.program)}</div>
      <div><span>Specialization</span>${esc(r.specialization)}</div>
      <div><span>CGPA</span>${r.cgpa != null ? Number(r.cgpa).toFixed(2) : ""}</div>
      <div><span>Year of passing</span>${esc(r.yearOfPassing)}</div>
      <div><span>Issued on</span>${esc(r.issueDate)}</div>
      ${r.revocationReason ? `<div><span>Revocation reason</span>${esc(r.revocationReason)}</div>` : ""}
    </div>` : "";
  $("#verifyResult").innerHTML = `
    <div class="result ${esc(r.outcome)}">
      <h2>${titles[r.outcome] || esc(r.outcome)}</h2>
      <p>${esc(r.message)}</p>
      ${details}
      <div class="cert-meta">Answered by ${esc(r.issuer)} at ${esc(new Date(r.checkedAt).toLocaleString())}
        ${r.ledgerTransactionId ? `<br><span class="mono">ledger tx ${esc(r.ledgerTransactionId)}</span>` : ""}</div>
    </div>`;
}

init();
