// ===== FACE SCAN STATE =====
// Kept separate from reel.js's globals (allStudents/markedStudents/currentPeriod)
// so the two attendance modes never cross-contaminate each other's state.
let faceTotalStudents = [];   // full roster for this ekstra + today's sheet status
let faceRoster = [];          // active (not-yet-attended) students that HAVE an enrolled face embedding
let faceScannedMap = new Map(); // nama -> status ("HADIR" | "PAGI" | "TERLAMBAT")
let faceRecentlySeen = new Map(); // nama -> timestamp, cooldown so one long look isn't logged repeatedly
let faceCurrentPeriod = null;
let faceUnenrolledCount = 0;

let faceModelsLoaded = false;
let faceStream = null;
let faceDetectLoopId = null;
let faceFacingMode = "user";
let faceIsSubmitting = false;
let faceMatchThreshold = 0.6;

const FACE_MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
const FACE_API_SRC = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
const FACE_SCAN_INTERVAL_MS = 900;
const FACE_COOLDOWN_MS = 5000;

// ===== ENTRY POINT (called from main.js showFaceID) =====
async function initFaceScan() {
  showLoading(true);

  const nameEl = document.getElementById("faceOperatorName");
  const ekstraEl = document.getElementById("faceOperatorEkstra");
  if (nameEl) nameEl.textContent = currentOperator || "-";
  if (ekstraEl) ekstraEl.textContent = isMaster ? "MASTER MODE" : (currentEkstra || "-");

  setFaceDetectorHint("Memuat data siswa...");

  try {
    await fetchFaceThreshold();
    await fetchFaceRoster();
    updateFaceStats();
    renderFaceRecentList();

    if (faceTotalStudents.length === 0) {
      showStatus("Tidak ada data siswa", "info");
    } else if (faceUnenrolledCount > 0) {
      showStatus(faceUnenrolledCount + " siswa belum daftar wajah", "info");
    }

    setFaceDetectorHint("Memuat model pengenalan wajah...");
    await loadFaceModels();

    setFaceDetectorHint("Menyalakan kamera...");
    await startFaceCamera();

    setFaceDetectorHint("🔍 Mendeteksi wajah...");
    startDetectionLoop();
  } catch (err) {
    console.error(err);
    showStatus("Error: " + err.message, "error");
    setFaceDetectorHint("Gagal memulai — coba lagi");
  }

  showLoading(false);
}

// Called when leaving the face scan screen (back button, logout)
function stopFaceScan() {
  stopDetectionLoop();
  stopFaceCameraStream();
  closeFaceSummary();
  faceScannedMap.clear();
  faceRecentlySeen.clear();
  faceRoster = [];
  faceTotalStudents = [];
  faceCurrentPeriod = null;
}

// ===== CONFIG =====
async function fetchFaceThreshold() {
  try {
    const res = await fetch(API_URL + "?action=getConfig").then(r => r.json());
    if (res.status === "ok" && res.threshold) {
      faceMatchThreshold = Number(res.threshold) || 0.6;
    }
  } catch (e) {
    // keep default threshold
  }
}

// ===== ROSTER + EMBEDDINGS =====
// Same PAGI/EKSTRA filtering rule as utils.js's filterForReel, but takes
// `period` as a parameter instead of reading main.js's global currentPeriod,
// so this module never gets confused with the REEL module's state.
function filterForFaceScan(students, period) {
  if (!period) return students;
  return students.filter(s => {
    const status = (s.status || "").trim();
    if (period.isPagi) return !["PAGI", "HADIR", "TERLAMBAT"].includes(status);
    if (period.isEkstra) return !["HADIR", "TERLAMBAT"].includes(status);
    return true;
  });
}

async function fetchFaceRoster() {
  const today = getJakartaDateString();
  const masterMode = currentEkstra === "MASTER";
  const ekstraParam = masterMode ? "MASTER" : currentEkstra;

  const [studentsRes, embedRes] = await Promise.all([
    fetch(API_URL + "?action=getStudentsByEkstra&ekstra=" + encodeURIComponent(ekstraParam) + "&date=" + encodeURIComponent(today)).then(r => r.json()),
    fetch(API_URL + "?action=getFaceDatabase&ekstra=" + encodeURIComponent(ekstraParam)).then(r => r.json())
  ]);

  if (studentsRes.status !== "ok") throw new Error(studentsRes.message || "Gagal memuat siswa");
  if (embedRes.status !== "ok") throw new Error(embedRes.message || "Gagal memuat data wajah");

  faceCurrentPeriod = {
    isPagi: studentsRes.isPagiPeriod,
    isEkstra: studentsRes.isEkstraPeriod,
    isOutside: studentsRes.isOutsideHours
  };

  let fetchedStudents = studentsRes.data || [];
  if (!masterMode) {
    fetchedStudents = fetchedStudents.filter(s => s.ekstra && s.ekstra.toLowerCase() === currentEkstra.toLowerCase());
  }

  const embedMap = new Map();
  (embedRes.data || []).forEach(e => embedMap.set(e.nama, e.faceEmbedding));

  faceTotalStudents = fetchedStudents;
  faceScannedMap.clear();
  faceRecentlySeen.clear();

  const active = filterForFaceScan(fetchedStudents, faceCurrentPeriod);
  const withEmbeddings = active.map(s => ({ ...s, faceEmbedding: embedMap.get(s.nama) || null }));

  faceRoster = withEmbeddings.filter(s => Array.isArray(s.faceEmbedding) && s.faceEmbedding.length > 0);
  faceUnenrolledCount = withEmbeddings.length - faceRoster.length;
}

// ===== FACE-API.JS SETUP =====
function loadFaceApiLibrary() {
  if (window.faceapi) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = FACE_API_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Gagal memuat pustaka face-api.js"));
    document.head.appendChild(script);
  });
}

async function loadFaceModels() {
  if (faceModelsLoaded) return;
  await loadFaceApiLibrary();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
  ]);
  faceModelsLoaded = true;
}

// ===== CAMERA =====
async function startFaceCamera() {
  stopFaceCameraStream();
  const video = document.getElementById("faceVideo");
  if (!video) return;

  faceStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: faceFacingMode },
    audio: false
  });
  video.srcObject = faceStream;
  await video.play();
}

function stopFaceCameraStream() {
  if (faceStream) {
    faceStream.getTracks().forEach(t => t.stop());
    faceStream = null;
  }
  const video = document.getElementById("faceVideo");
  if (video) video.srcObject = null;
}

function toggleFaceCamera() {
  faceFacingMode = faceFacingMode === "user" ? "environment" : "user";
  startFaceCamera().catch(err => showStatus("Tidak dapat mengganti kamera: " + err.message, "error"));
}

// ===== DETECTION LOOP =====
function startDetectionLoop() {
  stopDetectionLoop();
  faceDetectLoopId = setInterval(runFaceDetectionTick, FACE_SCAN_INTERVAL_MS);
}

function stopDetectionLoop() {
  if (faceDetectLoopId) {
    clearInterval(faceDetectLoopId);
    faceDetectLoopId = null;
  }
}

async function runFaceDetectionTick() {
  const video = document.getElementById("faceVideo");
  if (!video || video.readyState < 2 || !faceModelsLoaded) return;

  if (faceRoster.length === 0) {
    setFaceDetectorHint("Semua siswa sudah terdeteksi 🎉");
    setFaceFrameDetecting(false);
    return;
  }

  let detections;
  try {
    detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();
  } catch (e) {
    return; // transient decode error, try again next tick
  }

  if (!detections || detections.length === 0) {
    setFaceDetectorHint("🔍 Mendeteksi wajah...");
    setFaceFrameDetecting(false);
    return;
  }

  setFaceFrameDetecting(true);
  setFaceDetectorHint(detections.length + " wajah terlihat");

  detections.forEach(det => {
    const descriptor = Array.from(det.descriptor);
    const match = findBestFaceMatch(descriptor);
    if (match) handleFaceMatch(match.student, match.distance);
  });
}

function findBestFaceMatch(descriptor) {
  let best = null;
  let bestDistance = Infinity;

  faceRoster.forEach(student => {
    if (faceScannedMap.has(student.nama)) return;
    const dist = faceEuclideanDistance(descriptor, student.faceEmbedding);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = student;
    }
  });

  if (best && bestDistance <= faceMatchThreshold) {
    return { student: best, distance: bestDistance };
  }
  return null;
}

function faceEuclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - (b[i] || 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// ===== MATCH HANDLING =====
function computeFaceStatus(student) {
  if (!faceCurrentPeriod) return "HADIR";
  if (faceCurrentPeriod.isPagi) return "PAGI";
  if (faceCurrentPeriod.isEkstra) {
    const sheetVal = (student.status || "").trim();
    return (sheetVal === "PAGI") ? "HADIR" : "TERLAMBAT";
  }
  return "HADIR";
}

function handleFaceMatch(student, distance) {
  if (faceScannedMap.has(student.nama)) return;

  const now = Date.now();
  const lastSeen = faceRecentlySeen.get(student.nama) || 0;
  if (now - lastSeen < FACE_COOLDOWN_MS) return;
  faceRecentlySeen.set(student.nama, now);

  const status = computeFaceStatus(student);
  faceScannedMap.set(student.nama, status);
  faceRoster = faceRoster.filter(s => s.nama !== student.nama);

  updateFaceStats();
  renderFaceRecentList();
  showStatus("✅ " + student.nama + " terdeteksi (" + status + ")", "ok");
}

// ===== UI: STATS =====
function updateFaceStats() {
  const total = faceTotalStudents.length;
  const done = faceTotalStudents.filter(s => isFaceStudentDone(s)).length;
  const belum = total - done;

  const elTotal = document.getElementById("faceStatTotal");
  const elDone = document.getElementById("faceStatHadir");
  const elBelum = document.getElementById("faceStatBelum");
  const subHadir = document.getElementById("faceSubHadir");
  const subBelum = document.getElementById("faceSubBelum");

  if (elTotal) elTotal.textContent = total;
  if (elDone) elDone.textContent = done;
  if (elBelum) elBelum.textContent = belum;
  if (subHadir) subHadir.textContent = total ? Math.round((done / total) * 100) + "%" : "0%";
  if (subBelum) subBelum.textContent = total ? Math.round((belum / total) * 100) + "%" : "0%";
}

function isFaceStudentDone(s) {
  if (faceScannedMap.has(s.nama)) return true;
  const status = (s.status || "").trim();
  if (faceCurrentPeriod?.isPagi) return ["PAGI", "HADIR", "TERLAMBAT"].includes(status);
  if (faceCurrentPeriod?.isEkstra) return ["HADIR", "TERLAMBAT"].includes(status);
  return false;
}

function renderFaceRecentList() {
  const wrap = document.getElementById("faceRecentList");
  if (!wrap) return;
  const items = Array.from(faceScannedMap.entries()).reverse();
  wrap.innerHTML = items.map(([nama, status]) => `
    <div class="face-recent-chip">
      <span>✅ ${nama}</span>
      <span class="face-recent-status">${status}</span>
    </div>
  `).join("");
}

function setFaceDetectorHint(text) {
  const el = document.getElementById("faceDetectorHint");
  if (el) el.textContent = text;
}

function setFaceFrameDetecting(isDetecting) {
  const el = document.getElementById("faceFrame");
  if (el) el.classList.toggle("detecting", !!isDetecting);
}

// ===== SUMMARY MODAL =====
function openFaceSummary() {
  const done = faceTotalStudents.filter(s => isFaceStudentDone(s));
  const pending = faceTotalStudents.filter(s => !isFaceStudentDone(s));

  let html = `<div class="summary-section">
    <div class="summary-section-title done">✓ SUDAH TERDETEKSI (${done.length})</div>
    ${done.length ? done.map(s => `
      <div class="summary-item">
        ${s.foto ? `<img src="${s.foto}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : `<div class="summary-avatar">👤</div>`}
        <div class="summary-item-name">${s.nama}</div>
        <div class="summary-item-class">${s.kelas}</div>
      </div>
    `).join("") : "<div style='color:var(--text-secondary);font-size:13px;'>Belum ada</div>"}
  </div>`;

  html += `<div class="summary-section">
    <div class="summary-section-title pending">✗ BELUM TERDETEKSI (${pending.length})</div>
    ${pending.length ? pending.map(s => `
      <div class="summary-item">
        ${s.foto ? `<img src="${s.foto}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : `<div class="summary-avatar">👤</div>`}
        <div class="summary-item-name">${s.nama}</div>
        <div class="summary-item-class">${s.kelas}</div>
      </div>
    `).join("") : "<div style='color:var(--text-secondary);font-size:13px;'>Semua sudah terdeteksi! 🎉</div>"}
  </div>`;

  const body = document.getElementById("faceSummaryBody");
  const modal = document.getElementById("faceSummaryModal");
  if (body) body.innerHTML = html;
  if (modal) modal.classList.add("visible");
}

function closeFaceSummary() {
  const modal = document.getElementById("faceSummaryModal");
  if (modal) modal.classList.remove("visible");
}

// ===== SUBMIT =====
async function submitFaceScan() {
  if (faceIsSubmitting) return;
  if (faceScannedMap.size === 0) {
    showStatus("Belum ada siswa yang terdeteksi", "error");
    return;
  }

  faceIsSubmitting = true;
  showLoading(true);

  try {
    const scans = [];
    const now = new Date().toISOString();
    const today = getJakartaDateString();

    faceScannedMap.forEach((status, nama) => {
      scans.push({ nama, status, timestamp: now, date: today });
    });

    const payload = {
      action: "faceReelSubmit",
      scans: scans,
      operator: currentOperator,
      mode: "FACE"
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.status === "ok") {
      closeFaceSummary();
      showStatus(`✓ ${data.processed} data terkirim`, "ok");
      await fetchFaceRoster();
      updateFaceStats();
      renderFaceRecentList();
      startDetectionLoop();
    } else {
      showStatus(data.message || "Gagal mengirim", "error");
    }
  } catch (err) {
    showStatus("Error koneksi: " + err.message, "error");
  }

  faceIsSubmitting = false;
  showLoading(false);
}