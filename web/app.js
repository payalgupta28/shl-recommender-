// app.js — tiny vanilla-JS client for the SHL Assessment Advisor.
// The server is STATELESS, so this file keeps the running conversation in
// `messages` and resends the whole history on every POST /chat.

const $ = (id) => document.getElementById(id);
const DEFAULT_MODELS = { groq: "llama-3.3-70b-versatile", gemini: "gemini-2.0-flash",
                         openrouter: "meta-llama/llama-3.3-70b-instruct:free" };
const MAX_TURNS = 8;

let messages = [];        // [{role, content}] — the stateless history
let ended = false;
let serverLlmReady = false; // true if the server already has its own LLM key

// ---- settings persistence (browser localStorage only) -------------------- //
function loadSettings() {
  $("provider").value = localStorage.getItem("shl_provider") || "groq";
  $("model").value = localStorage.getItem("shl_model") || "";
  $("apiKey").value = localStorage.getItem("shl_key") || "";
  if ($("apiKey").value) setStatus("Key loaded from this browser.");
}
function setStatus(msg) { $("keyStatus").textContent = msg; }

$("provider").addEventListener("change", () => {
  $("model").placeholder = DEFAULT_MODELS[$("provider").value] || "auto";
});

$("saveKey").addEventListener("click", () => {
  localStorage.setItem("shl_provider", $("provider").value);
  localStorage.setItem("shl_model", $("model").value.trim());
  localStorage.setItem("shl_key", $("apiKey").value.trim());
  setStatus($("apiKey").value.trim() ? "Saved. Ask away below ↓" : "Cleared.");
});

// ---- rendering ----------------------------------------------------------- //
function addBubble(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "user" : "bot"}`;
  const b = document.createElement("div");
  b.className = "bubble";
  b.textContent = text;
  wrap.appendChild(b);
  $("chat").appendChild(wrap);
  $("chat").scrollTop = $("chat").scrollHeight;
  return wrap;
}

function addRecommendations(recs) {
  if (!recs || !recs.length) return;
  const grid = document.createElement("div");
  grid.className = "recs";
  for (const r of recs) {
    const card = document.createElement("div");
    card.className = "rec";
    card.innerHTML =
      `<a href="${r.url}" target="_blank" rel="noopener">${r.name}</a>` +
      `<span class="badge">${r.test_type || "—"}</span>`;
    grid.appendChild(card);
  }
  $("chat").lastChild.appendChild(grid);
  $("chat").scrollTop = $("chat").scrollHeight;
}

function updateTurnMeter() {
  const left = Math.max(0, MAX_TURNS - messages.length);
  $("turnMeter").textContent =
    `Turn ${messages.length}/${MAX_TURNS}` + (left <= 2 && left > 0 ? "  · wrapping up soon" : "");
}

// ---- sending ------------------------------------------------------------- //
async function send(text) {
  if (ended || !text.trim()) return;
  const key = localStorage.getItem("shl_key");
  if (!key && !serverLlmReady) { setStatus("⚠ Add an API key above first."); return; }

  messages.push({ role: "user", content: text });
  addBubble("user", text);
  updateTurnMeter();
  $("input").value = "";
  $("send").disabled = true;

  const thinking = addBubble("bot", "…");
  thinking.querySelector(".bubble").classList.add("typing");

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LLM-Provider": localStorage.getItem("shl_provider") || "groq",
        "X-LLM-Api-Key": key,
        "X-LLM-Model": localStorage.getItem("shl_model") || "",
      },
      body: JSON.stringify({ messages }),
    });
    const data = await res.json();
    thinking.remove();

    addBubble("bot", data.reply || "(no reply)");
    addRecommendations(data.recommendations);
    messages.push({ role: "assistant", content: data.reply || "" });
    updateTurnMeter();

    if (data.end_of_conversation) {
      ended = true;
      const banner = document.createElement("div");
      banner.className = "end-banner";
      banner.textContent = "— conversation complete · start a new one anytime —";
      $("chat").appendChild(banner);
    }
  } catch (e) {
    thinking.remove();
    addBubble("bot", "Network error talking to the service: " + e.message);
  } finally {
    $("send").disabled = ended;
  }
}

$("composer").addEventListener("submit", (e) => { e.preventDefault(); send($("input").value); });
document.querySelectorAll(".chip").forEach((c) =>
  c.addEventListener("click", () => send(c.dataset.q)));

$("resetChat").addEventListener("click", () => {
  messages = []; ended = false;
  $("chat").innerHTML = ""; $("send").disabled = false;
  updateTurnMeter();
});

// ---- init ---------------------------------------------------------------- //
(async function init() {
  loadSettings();
  $("model").placeholder = DEFAULT_MODELS[$("provider").value] || "auto";
  updateTurnMeter();
  try {
    const cfg = await (await fetch("/config")).json();
    $("catalogSize").textContent = `${cfg.catalog_size} SHL assessments indexed`;
    serverLlmReady = !!cfg.server_llm_ready;
    if (serverLlmReady) {
      $("settings").style.display = "none";   // server has a key -> just chat
      const note = document.createElement("div");
      note.className = "catalog-size";
      note.textContent = "AI ready ✓";
    }
  } catch { $("catalogSize").textContent = ""; }
})();
