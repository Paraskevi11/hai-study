console.log("EXPERIMENT.JS VERSION: 45items + encouragement 2026-02-24");

/*******************************************************
 Human–AI Interaction Study (jsPsych 7.x)
 - Auto participant code
 - Consent + demographics
 - Robust CSV parser (handles commas inside quotes)
 - Likert 1–7 confidence
 - AI advice (phase-based reliability)
 - 45 items (15 per phase), forced A->B->C
 - Encouragement pages after item 15, 25, 35
 - Debrief + local CSV download (for testing)
*******************************************************/

// ===== Debug overlay: show errors on the page (no blank screen) =====
window.addEventListener("error", (e) => {
  document.body.innerHTML =
    `<pre style="white-space:pre-wrap; font-size:14px; padding:16px; color:#b00020;">
JS ERROR:
${e.message}
FILE: ${e.filename}
LINE: ${e.lineno}:${e.colno}
</pre>`;
});
window.addEventListener("unhandledrejection", (e) => {
  document.body.innerHTML =
    `<pre style="white-space:pre-wrap; font-size:14px; padding:16px; color:#b00020;">
PROMISE ERROR:
${e.reason}
</pre>`;
});

// ===== Helpers =====

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formats "Rules:" stems into a bullet list for readability.
 * Expected input pattern (example):
 *   "Rules: If ..., then .... If ..., then .... This device is .... Which must be true?"
 */
function formatRulesForDisplay(stem) {
  const s = String(stem ?? "").trim();
  if (!/^\s*Rules?:\s*/i.test(s)) {
    return `<p style="font-size:18px;">${escapeHtml(s)}</p>`;
  }

  // Remove "Rule:" / "Rules:"
  let body = s.replace(/^\s*Rules?:\s*/i, "").trim();

  // Pull off the final question if it ends with a question mark
  let question = "";
  const qMatch = body.match(/(Which|What)\b[^?]*\?\s*$/i);
  if (qMatch) {
    question = qMatch[0].trim();
    body = body.slice(0, body.length - qMatch[0].length).trim();
  }

  // Split remaining content into rule/fact sentences
  // (simple heuristic: split on periods)
  const parts = body
    .split(".")
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => (/[?!]$/.test(p) ? p : p + "."));

  const lis = parts.map(p => `<li>${escapeHtml(p)}</li>`).join("");

  return `
  <div class="rule-block">
    <p style="font-size:18px; margin:0 0 8px 0;"><b>Rules:</b></p>
    <ul>${lis}</ul>
    ${question ? `<p class="rule-question"><b>${escapeHtml(question)}</b></p>` : ""}
  </div>
`;
}   
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function downloadCSV(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== Robust CSV parser (handles commas inside quotes) =====
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    // Escaped quote inside quoted field: ""
    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }

    // newline (handle \r\n and \n)
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++; // skip \n in \r\n
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  // last cell
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }

  // Remove empty trailing rows
  const cleaned = rows.filter(r => r.some(cell => (cell ?? "").trim() !== ""));
  if (cleaned.length === 0) return [];

  const headers = cleaned[0].map(h => h.trim());
  return cleaned.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

// ===== Get correct option text safely (supports multiple formats) =====
function getCorrectOptionKey(item) {
  const c = (item.correct_option || "").trim();

  // Support numeric 0/1/2/3 (preferred for your current CSV)
  if (["0","1","2","3"].includes(c)) return c;

  // Also support A/B/C/D (older format)
  if (["A", "B", "C", "D"].includes(c)) return "option_" + c.toLowerCase();

  if (["option_a", "option_b", "option_c", "option_d"].includes(c)) return c;

  if (["a", "b", "c", "d"].includes(c.toLowerCase())) return "option_" + c.toLowerCase();

  if (item.correct_answer && item.correct_answer.trim() !== "") return null;

  return null;
}

function getCorrectText(item, optionsOriginal) {
  const key = getCorrectOptionKey(item);

  // Numeric correct option 0/1/2/3
  if (key && ["0","1","2","3"].includes(key)) {
    return optionsOriginal[Number(key)];
  }

  // option_a... format
  if (key && item[key]) return item[key];

  // direct correct answer text column (optional)
  if (item.correct_answer && item.correct_answer.trim() !== "") return item.correct_answer.trim();

  return "";
}

// ===== AI reliability schedule by phase (High -> Low -> High) =====
const AI_ACCURACY_BY_PHASE = {
  A: 0.85,
  B: 0.45,
  C: 0.85
};

// ===== encouragement pages =====
function encouragementPage(messageHtml, tag) {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div style="text-align:left; max-width:900px;">
        <h2>${messageHtml}</h2>
        <p style="margin-top:12px;">Click continue when you are ready.</p>
      </div>
    `,
    choices: ["Continue"],
    data: { stage: "encouragement", encouragement_tag: tag }
  };
}

// ===== Main =====
(async function run() {

  const jsPsych = initJsPsych({
  on_finish: async () => {
    // ---- Send to Google Apps Script (online saving) ----
    const fullData = jsPsych.data.get().values();

    // demographics are the FIRST survey-html-form trial in your timeline
    const demo = jsPsych.data.get().filter({ trial_type: "survey-html-form" }).values()[0]?.response || {};

    const payload = {
      token: "HAI2026_SECURE",
      participant_id: participant_id,
      age: demo.age || "",
      gender: demo.gender || "",
      education: demo.education || "",
      full_data: fullData
    };

    try {
      // Tip: Use text/plain to avoid CORS preflight issues with Apps Script
      await fetch("https://script.google.com/macros/s/AKfycbxyESoH5AH-s1a6NbVnHwnOP3i-12t4lIj7nmQwdLRB9b7GH-gWsYWybp31c4VOWxXK/exec", {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      console.log("✅ Data sent to Google Apps Script");
    } catch (err) {
      console.error("❌ Failed to send data to Google Apps Script", err);
    }
  }
});

  // Wider content and readable buttons (injected styles)
const styleTag = document.createElement("style");
styleTag.innerHTML = `
  .jspsych-content { max-width: 900px; }
  .jspsych-btn { white-space: normal; text-align: left; line-height: 1.35; }
  .jspsych-html-button-response-stimulus { text-align: left; }
  .jspsych-slider { width: 100%; }

  /* ===== Rule formatting ===== */
  .rule-block ul {
    margin: 0;
    padding-left: 24px;
    font-size: 18px;
    line-height: 1.6;
  }

  .rule-block li {
    margin: 6px 0;
  }

  .rule-question {
    margin-top: 12px;
    font-size: 18px;
    font-weight: 500;
  }
`;
document.head.appendChild(styleTag);

const timeline = [];

  /***************
   AUTO PARTICIPANT CODE
  ***************/
  const participant_id =
    "HCI-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  jsPsych.data.addProperties({ participant_id });

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div style="text-align:left;">
        <h2>Your anonymous participant code</h2>
        <p style="font-size:18px;"><b>${participant_id}</b></p>
        <p>Please save this code. If you later wish to withdraw your data, you can contact the researcher with this code.</p>
      </div>
    `,
    choices: ["Continue"]
  });

  /***************
   CONSENT
  ***************/
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div style="text-align:left;">
        <h2>Consent Form</h2>
        <p>You are invited to participate in a research study about human interaction with AI systems.</p>
        <p><b>Voluntary participation:</b> You may withdraw at any time by closing the browser window, without penalty.</p>
        <p><b>Data:</b> No personally identifying information is collected. Responses are stored under your anonymous code.</p>
        <p>By clicking <b>"I Consent"</b>, you confirm you are at least 18 years old and agree to participate.</p>
      </div>
    `,
    choices: ["I Consent", "I Do NOT Consent"],
    on_finish: (data) => {
      if (data.response === 1) {
        jsPsych.endExperiment("You chose not to participate. Thank you.");
      }
    }
  });

  /***************
   DEMOGRAPHICS
  ***************/
  timeline.push({
    type: jsPsychSurveyHtmlForm,
    html: `
      <div style="text-align:left; max-width:900px;">
        <h2>Demographics</h2>

        <p><b>Age</b><br>
        <input name="age" type="number" min="18" max="120" required style="width:120px;"></p>

        <p><b>Gender</b><br>
        <select name="gender" required>
          <option value="">Select</option>
          <option>Female</option>
          <option>Male</option>
          <option>Non-binary</option>
          <option>Prefer not to say</option>
        </select></p>

        <p><b>Education level</b><br>
        <select name="education" required>
          <option value="">Select</option>
          <option>High school</option>
          <option>Bachelor</option>
          <option>Master</option>
          <option>PhD</option>
          <option>Other</option>
        </select></p>
      </div>
    `,
    button_label: "Continue"
  });

  /***************
   INSTRUCTIONS
  ***************/
  timeline.push({
    type: jsPsychInstructions,
    pages: [
      `
      <div style="text-align:left;">
        <h2>Instructions</h2>
        <p>You will answer a series of reasoning questions.</p>
        <p>For each item:</p>
        <ol>
          <li>You select an initial answer.</li>
          <li>You rate your confidence (1 to 7).</li>
          <li>An AI advisor provides a recommendation.</li>
          <li>You choose a final answer and rate confidence again.</li>
        </ol>
        <p>The AI may be correct or incorrect.</p>
        <p>Attention: When you are asked to rate condifence on the confidence scale (1 to 7), with 1 being the lowest confidence and 7 being the highest confidence, you must click on any of the numbers. .</p>
      </div>
      `
    ],
    show_clickable_nav: true
  });

  /***************
   LOAD ITEMS
  ***************/
  const res = await fetch("items.csv");
  const csvText = await res.text();
  const items = parseCSV(csvText);

  if (!items || items.length === 0) {
    throw new Error("items.csv loaded but no rows were parsed. Check the CSV format/quotes.");
  }

  // Basic sanity check (helps catch column name mismatches)
  const neededCols = ["stem", "option_a", "option_b", "option_c", "option_d", "correct_option", "phase"];
  const missing = neededCols.filter(c => !(c in items[0]));
  if (missing.length > 0) {
    throw new Error("items.csv is missing columns: " + missing.join(", "));
  }

  // ---- 45-trial check: require 15 per phase ----
  const counts = items.reduce((acc, it) => {
    const ph = (it.phase || "").trim().toUpperCase();
    acc[ph] = (acc[ph] || 0) + 1;
    return acc;
  }, {});
  if (items.length !== 45 || counts.A !== 15 || counts.B !== 15 || counts.C !== 15) {
    throw new Error(`Expected 45 items with 15 per phase (A,B,C). Found total=${items.length}, A=${counts.A||0}, B=${counts.B||0}, C=${counts.C||0}`);
  }

  // ---- Force phase order A -> B -> C (keep within-phase order) ----
  const A = items.filter(it => (it.phase || "").trim().toUpperCase() === "A");
  const B = items.filter(it => (it.phase || "").trim().toUpperCase() === "B");
  const C = items.filter(it => (it.phase || "").trim().toUpperCase() === "C");
  const ordered = A.concat(B, C);

  /***************
   TRIAL BUILDER (per item)
  ***************/
  function buildTrialFromItem(item, trialIndex) {

    const phase = (item.phase || "").trim().toUpperCase() || "A";
    const aiAcc = AI_ACCURACY_BY_PHASE[phase] ?? 0.70;

    const stem = item.stem;
    const optionsOriginal = [item.option_a, item.option_b, item.option_c, item.option_d];
    const correctText = getCorrectText(item, optionsOriginal);

    // Shuffle options but keep track of correct index
    const options = shuffle(optionsOriginal);
    const correctIndex = correctText ? options.indexOf(correctText) : -1;

    // AI chooses either correct or incorrect based on phase accuracy
    const aiCorrect = (correctIndex >= 0) ? (Math.random() < aiAcc) : false;

    let aiChoiceIndex = 0;
    if (correctIndex < 0) {
      aiChoiceIndex = Math.floor(Math.random() * 4);
    } else {
      if (aiCorrect) {
        aiChoiceIndex = correctIndex;
      } else {
        const wrongs = [0, 1, 2, 3].filter(i => i !== correctIndex);
        aiChoiceIndex = wrongs[Math.floor(Math.random() * wrongs.length)];
      }
    }

    const baseData = {
      item_id: item.item_id || `item_${trialIndex + 1}`,
      phase,
      type: item.type || "",
      difficulty: item.difficulty || "",
      trial_index: trialIndex + 1,
      stem,
      option_a: item.option_a,
      option_b: item.option_b,
      option_c: item.option_c,
      option_d: item.option_d,
      correct_option: item.correct_option,
      correct_text: correctText,
      correct_index_shuffled: correctIndex,
      ai_accuracy_target: aiAcc,
      ai_correct: aiCorrect,
      ai_choice_index: aiChoiceIndex,
      ai_choice_text: options[aiChoiceIndex]
    };

    const trials = [];

    // (1) Initial answer
    trials.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: `
        <div style="text-align:left;">
          <p style="font-size:18px;"><b>Question ${trialIndex + 1} / 45</b></p>
          ${formatRulesForDisplay(stem)}
        </div>
      `,
      choices: options,
      data: { ...baseData, stage: "initial_answer" },
      on_finish: (data) => {
        data.initial_choice_index = data.response;
        data.initial_choice_text = options[data.response];
        data.initial_correct = (correctIndex >= 0) ? (data.response === correctIndex) : null;
      }
    });

    // (2) Confidence (Initial) – 1–7 clickable buttons
    trials.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: `
        <div style="text-align:left;">
          <h3>Confidence (Initial)</h3>
          <p>How confident are you in your answer?</p>
        </div>
      `,
      choices: ["1","2","3","4","5","6","7"],
      data: { ...baseData, stage: "initial_confidence" },
      on_finish: (data) => {
        // Button index 0–6 → confidence 1–7
        data.initial_confidence = (typeof data.response === "number") ? (data.response + 1) : null;
      }
    });

    // (3) AI advice
    trials.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: `
        <div style="text-align:left;">
          <h3>AI Recommendation</h3>
          <p>The AI recommends:</p>
          <p style="font-size:18px;"><b>${options[aiChoiceIndex]}</b></p>
        </div>
      `,
      choices: ["Continue"],
      data: { ...baseData, stage: "ai_advice" }
    });

    // (4) Final answer
    trials.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: `
        <div style="text-align:left;">
          <h3>Final Answer</h3>
          <p>Please choose your final answer:</p>
        </div>
      `,
      choices: options,
      data: { ...baseData, stage: "final_answer" },
      on_finish: (data) => {
        data.final_choice_index = data.response;
        data.final_choice_text = options[data.response];
        data.final_correct = (correctIndex >= 0) ? (data.response === correctIndex) : null;

        const lastInitial = jsPsych.data.get().filter({ stage: "initial_answer", item_id: baseData.item_id }).last(1).values()[0];
        if (lastInitial) {
          data.changed_answer = (data.final_choice_index !== lastInitial.initial_choice_index) ? 1 : 0;
        } else {
          data.changed_answer = null;
        }
      }
    });

    // (5) Confidence (Final) – 1–7 clickable buttons
    trials.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: `
        <div style="text-align:left;">
          <h3>Confidence (Final)</h3>
          <p>How confident are you in your final answer?</p>
        </div>
      `,
      choices: ["1","2","3","4","5","6","7"],
      data: { ...baseData, stage: "final_confidence" },
      on_finish: (data) => {
        // Button index 0–6 → confidence 1–7
        data.final_confidence = (typeof data.response === "number") ? (data.response + 1) : null;
      }
    });

    return trials;
  }

  // ---- Build trials + encouragement pages after item 15, 25, 35 ----
  ordered.forEach((item, idx) => {
    timeline.push(...buildTrialFromItem(item, idx));

    // encouragement AFTER completing those items
   switch (idx) {
  case 14:
    timeline.push(
      encouragementPage("Keep up the great work! (ง'̀-'́)ง", "after_15")
    );
    break;

  case 24:
    timeline.push(
      encouragementPage(
        "Take a break for coffee, you're halfway there!! (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
        "after_25"
      )
    );
    break;

  case 34:
    timeline.push(
      encouragementPage(
        "You're so close to the end!!! ᕦ(ò_óˇ)ᕤ",
        "after_35"
      )
    );
    break;

  default:
    break;
}
  });

 /***************
 DEBRIEF
***************/
timeline.push({
  type: jsPsychHtmlButtonResponse,
  stimulus: `
    <div style="text-align:left;">
      <h2>You did it!!! ヾ(⌐■_■)ノ♪</h2>
      <h2>Debrief</h2>
      <p>This study examines how people interact with AI advice while solving reasoning tasks.</p>
      <p>The AI recommendations were simulated and varied in reliability across the study.</p>
      <p>For more information please contact us through email at paraskevi1818@gmail.com.</p>
      <p>Thank you for participating.</p>
    </div>
  `,
  choices: ["Finish"]
});

// IMPORTANT: jsPsych.run() does NOT return a Promise in jsPsych 7,
// so don't use .then(). Use on_finish instead.
jsPsych.run(timeline);

// Close the async IIFE properly
})(); 
