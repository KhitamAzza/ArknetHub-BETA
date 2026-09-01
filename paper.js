// ============================================
// paper.js — Pembina: Upload Bukti Foto
// ============================================

const CLOUDINARY_CLOUD_NAME = 'ddccvdnye';     
const CLOUDINARY_UPLOAD_PRESET = 'arknet_unsigned';   

let paperStudents = [];
let paperCapturedImage = null;
let paperVideoStream = null;
let paperCameraFacing = 'environment';

/* ===== SCREEN NAVIGATION ===== */
function showPaperScreen() {
  hideAllScreens();
  const el = document.getElementById("paperScreen");
  if (el) {
    el.style.display = "flex";
    initPaperScreen();
  }
}

function backToDashboardFromPaper() {
  stopPaperCamera();
  hideAllScreens();
  showDashboard();
}

async function initPaperScreen() {
  await loadPaperStudents();
  renderPaperPrint();

  const btnPrint = document.getElementById('paperTabPrint');
  const titleEl = document.querySelector('#paperScreen .operator-name');

  if (isMaster) {
    // Admin sees both tabs (print + upload)
    if (btnPrint) btnPrint.style.display = '';
    if (titleEl) titleEl.textContent = 'Cetak & Upload Absensi';
    switchPaperTab('print');
  } else {
    // Pembina: only upload
    if (btnPrint) btnPrint.style.display = 'none';
    if (titleEl) titleEl.textContent = 'Upload Absensi';
    switchPaperTab('camera');
  }
}

/* ===== LOAD STUDENTS ===== */
async function loadPaperStudents() {
  showLoading(true);
  try {
    const { data, error } = await sb
      .from('Database')
      .select('id, nama, kelas, photo_url')
      .eq('ekstra', currentEkstra)
      .order('nama');
    if (error) throw error;
    paperStudents = data || [];
  } catch (e) {
    console.error(e);
    paperStudents = [];
  }
  showLoading(false);
}

/* ===== TABS ===== */
function switchPaperTab(tab) {
  const btnPrint = document.getElementById('paperTabPrint');
  const btnCam   = document.getElementById('paperTabCamera');
  const secPrint = document.getElementById('paperPrintSection');
  const secCam   = document.getElementById('paperCameraSection');
  
  if (btnPrint) btnPrint.classList.toggle('active', tab === 'print');
  if (btnCam)   btnCam.classList.toggle('active', tab === 'camera');
  if (secPrint) secPrint.style.display = tab === 'print' ? 'block' : 'none';
  if (secCam)   secCam.style.display = tab === 'camera' ? 'block' : 'none';
  
  if (tab === 'camera') startPaperCamera();
  else stopPaperCamera();
}

/* ===== PRINT SECTION ===== */
function renderPaperPrint() {
  const container = document.getElementById('paperPrintArea');
  if (!container) return;

  const dateStr = getJakartaDateString();
  const semStr  = currentSemester || '-';
  const totalStudents = paperStudents.length;
  const pagesNeeded = Math.max(1, Math.ceil(totalStudents / 30));

  // Show page count banner
    const bannerHtml = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px;">
      <div style="font-size:24px;">📄</div>
      <div style="flex:1;">
        <div style="font-size:14px;font-weight:700;">${totalStudents} siswa = ${pagesNeeded} lembar</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Harap upload semua ${pagesNeeded} lembar ke sistem</div>
      </div>
      <div style="background:var(--accent);color:#fff;font-size:13px;font-weight:800;padding:6px 12px;border-radius:20px;min-width:32px;text-align:center;" id="paperUploadCounter">0/${pagesNeeded}</div>
    </div>
  `;

  const pageBanner = document.getElementById('paperPageBanner');
  if (pageBanner) pageBanner.innerHTML = bannerHtml;

    const cameraBanner = document.getElementById('paperCameraBanner');
  if (cameraBanner) {
    const camText = cameraBanner.querySelector('#paperCameraBannerText');
    const camCounter = cameraBanner.querySelector('#paperCameraUploadCounter');
    if (camText) camText.textContent = `${totalStudents} siswa = ${pagesNeeded} lembar`;
    if (camCounter) camCounter.textContent = `0/${pagesNeeded}`;
    cameraBanner.style.display = 'flex';
  }
  
  const rows = paperStudents.map((s, i) => `
    <tr>
      <td style="border:1px solid #333;padding:6px;text-align:center;">${i+1}</td>
      <td style="border:1px solid #333;padding:6px;">${escapeHtml(s.nama)}</td>
      <td style="border:1px solid #333;padding:6px;text-align:center;">${escapeHtml(s.kelas)}</td>
      <td style="border:1px solid #333;padding:6px;text-align:center;"><span style="display:inline-block;width:10px;height:10px;border:1.5px solid #333;"></span></td>
      <td style="border:1px solid #333;padding:6px;text-align:center;"><span style="display:inline-block;width:10px;height:10px;border:1.5px solid #333;"></span></td>
      <td style="border:1px solid #333;padding:6px;text-align:center;"><span style="display:inline-block;width:10px;height:10px;border:1.5px solid #333;"></span></td>
      <td style="border:1px solid #333;padding:6px;text-align:center;"><span style="display:inline-block;width:10px;height:10px;border:1.5px solid #333;"></span></td>
      <td style="border:1px solid #333;padding:6px;text-align:center;"><span style="display:inline-block;width:10px;height:10px;border:1.5px solid #333;"></span></td>
      <td style="border:1px solid #333;padding:6px;text-align:center;"><span style="display:inline-block;width:10px;height:10px;border:1.5px solid #333;"></span></td>
      <td style="border:1px solid #333;padding:6px;text-align:center;font-weight:700;">${i+1}</td>
    </tr>
  `).join('');
  
  container.innerHTML = `
    <div class="paper-sheet" id="paperSheet">
      <div class="paper-corner tl"></div>
      <div class="paper-corner tr"></div>
      <div class="paper-corner bl"></div>
      <div class="paper-corner br"></div>
      
      <div class="paper-header">
        <h2>DAFTAR HADIR EKSTRAKURIKULER</h2>
        <div class="paper-meta">
          <div><strong>Ekskul:</strong> ${escapeHtml(currentEkstra)}</div>
          <div><strong>Tanggal:</strong> ${dateStr}</div>
          <div><strong>Semester:</strong> ${semStr}</div>
        </div>
      </div>
      
      <table class="paper-table" style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="border:1px solid #333;padding:8px;width:40px;" rowspan="2">No</th>
            <th style="border:1px solid #333;padding:8px;" rowspan="2">Nama Siswa</th>
            <th style="border:1px solid #333;padding:8px;width:80px;" rowspan="2">Kelas</th>
            <th style="border:1px solid #333;padding:8px;" colspan="6">Kehadiran</th>
            <th style="border:1px solid #333;padding:8px;width:40px;" rowspan="2">No</th>
          </tr>
          <tr style="background:#f0f0f0;">
            <th style="border:1px solid #333;padding:8px;width:36px;">PAGI</th>
            <th style="border:1px solid #333;padding:8px;width:36px;">EKSTRA</th>
            <th style="border:1px solid #333;padding:8px;width:36px;">PAGI</th>
            <th style="border:1px solid #333;padding:8px;width:36px;">EKSTRA</th>
            <th style="border:1px solid #333;padding:8px;width:36px;">PAGI</th>
            <th style="border:1px solid #333;padding:8px;width:36px;">EKSTRA</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      
      <div class="paper-footer">
        <div class="paper-signature">
          <div>Mengetahui,</div>
          <div style="margin-top:60px;">(_______________________)</div>
          <div>Pembina Ekskul</div>
        </div>
      </div>
    </div>
  `;
}

function printPaper() {
  const sheet = document.getElementById('paperSheet');
  if (!sheet) return;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Cetak Absensi</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, sans-serif; color: #000; background: #fff; margin: 0; }
          .paper-sheet { width: 190mm; min-height: 277mm; position: relative; padding: 20mm; box-sizing: border-box; margin: 0 auto; }
          .paper-corner { position: absolute; width: 15mm; height: 15mm; background: #000; }
          .paper-corner.tl { top: 10mm; left: 10mm; }
          .paper-corner.tr { top: 10mm; right: 10mm; }
          .paper-corner.bl { bottom: 10mm; left: 10mm; }
          .paper-corner.br { bottom: 10mm; right: 10mm; }
          .paper-header { text-align: center; margin-bottom: 20px; }
          .paper-header h2 { margin: 0 0 8px; font-size: 18px; }
          .paper-meta { display: flex; justify-content: space-between; font-size: 12px; margin-top: 12px; }
          .paper-table th, .paper-table td { font-size: 12px; }
          .paper-table tbody tr:nth-child(even) { background: #f5f5f5; }
          .paper-footer { margin-top: 40px; display: flex; justify-content: flex-end; }
          .paper-signature { text-align: center; font-size: 12px; width: 200px; }
        </style>
      </head>
      <body>${sheet.outerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 250);
}

/* ===== CAMERA SECTION ===== */
async function startPaperCamera() {
  const video = document.getElementById('paperVideo');
  if (!video) return;
  try {
    paperVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: paperCameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = paperVideoStream;
    updateFlashlightButton();
    startExposureCheck();
  } catch (err) {
    showStatus('Tidak dapat mengakses kamera: ' + err.message, 'error');
  }
}

// NEW: toggle front/back
async function switchPaperCamera() {
  paperCameraFacing = paperCameraFacing === 'environment' ? 'user' : 'environment';
  stopPaperCamera();
  
  const video = document.getElementById('paperVideo');
  if (!video) return;
  
  try {
    paperVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: paperCameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = paperVideoStream;
    updateFlashlightButton();
  } catch (err) {
    // Revert on failure so next tap tries the other side again
    paperCameraFacing = paperCameraFacing === 'environment' ? 'user' : 'environment';
    showStatus('Gagal ganti kamera: ' + err.message, 'error');
  }
}
/* ===== FLASHLIGHT ===== */
let paperTorchOn = false;

function updateFlashlightButton() {
  const btn = document.getElementById('paperFlashlightBtn');
  if (!btn) return;

  if (!paperVideoStream) {
    btn.style.display = 'none';
    return;
  }

  // getCapabilities often doesn't report torch on mobile even when it works.
  // Show the button on mobile devices and let togglePaperFlashlight() fail gracefully.
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  btn.style.display = isMobile ? 'flex' : 'none';
  btn.textContent = paperTorchOn ? '🔦' : '🔅';
  btn.title = paperTorchOn ? 'Matikan Flash' : 'Nyalakan Flash';
}
async function togglePaperFlashlight() {
  if (!paperVideoStream) return;
  const track = paperVideoStream.getVideoTracks()[0];
  if (!track) return;

  paperTorchOn = !paperTorchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: paperTorchOn }] });
    updateFlashlightButton();
    showStatus(paperTorchOn ? '🔦 Flash menyala' : '🔅 Flash mati', 'ok');
  } catch (err) {
    showStatus('Flash tidak didukung di kamera ini', 'error');
    paperTorchOn = false;
    updateFlashlightButton();
  }
}
/* ===== EXPOSURE CHECK ===== */
function checkPaperExposure() {
  const video = document.getElementById('paperVideo');
  const canvas = document.getElementById('paperCaptureCanvas');
  const hint = document.getElementById('paperCameraHint');
  if (!video || !canvas || !video.videoWidth) return;
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0);
  
  const cx = Math.floor(canvas.width / 2);
  const cy = Math.floor(canvas.height / 2);
  const sampleW = Math.floor(canvas.width * 0.3);
  const sampleH = Math.floor(canvas.height * 0.3);
  
  const imgData = ctx.getImageData(cx - sampleW/2, cy - sampleH/2, sampleW, sampleH).data;
  let total = 0, count = 0;
  for (let i = 0; i < imgData.length; i += 16) {
    total += (imgData[i] + imgData[i+1] + imgData[i+2]) / 3;
    count++;
  }
  const avg = total / count;
  
  const exposureEl = document.getElementById('paperExposureBadge');
  if (!exposureEl) return;
  
  if (avg < 40) {
    exposureEl.textContent = '🔅 GELAP';
    exposureEl.style.background = 'rgba(239,68,68,0.2)';
    exposureEl.style.color = 'var(--red)';
    exposureEl.style.display = 'flex';
    if (hint) hint.textContent = 'Pencahayaan terlalu gelap. Nyalakan flash atau pindah ke tempat lebih terang.';
  } else if (avg > 220) {
    exposureEl.textContent = '☀️ TERANG';
    exposureEl.style.background = 'rgba(245,158,11,0.2)';
    exposureEl.style.color = 'var(--yellow)';
    exposureEl.style.display = 'flex';
    if (hint) hint.textContent = 'Pencahayaan terlalu terang. Kurangi cahaya atau jauhkan dari lampu langsung.';
  } else {
    exposureEl.style.display = 'none';
    if (hint) hint.textContent = 'Arahkan kamera ke kertas. Pastikan 4 kotak hitam terlihat di sudut.';
  }
}

let paperExposureInterval = null;
function startExposureCheck() {
  if (paperExposureInterval) clearInterval(paperExposureInterval);
  paperExposureInterval = setInterval(checkPaperExposure, 1500);
}
function stopExposureCheck() {
  if (paperExposureInterval) { clearInterval(paperExposureInterval); paperExposureInterval = null; }
  const el = document.getElementById('paperExposureBadge');
  if (el) el.style.display = 'none';
}
function stopPaperCamera() {
  if (paperVideoStream) {
    paperVideoStream.getTracks().forEach(t => t.stop());
    paperVideoStream = null;
  }
  const video = document.getElementById('paperVideo');
  if (video) video.srcObject = null;
  paperTorchOn = false;
  stopExposureCheck();
}

function capturePaper() {
  const video  = document.getElementById('paperVideo');
  const canvas = document.getElementById('paperCaptureCanvas');
  const preview = document.getElementById('paperPreview');
  if (!video || !canvas || !video.videoWidth) return;
  
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  
  // Compress
  const maxW = 1200;
  let w = canvas.width, h = canvas.height;
  if (w > maxW) { h = Math.round((maxW / w) * h); w = maxW; }
  
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').drawImage(canvas, 0, 0, w, h);
  paperCapturedImage = tmp.toDataURL('image/jpeg', 0.8);
  
  // Show preview — fill the portrait container
  if (preview) { 
    preview.src = paperCapturedImage; 
    preview.style.display = 'block';
  }
  
  const btnCap = document.getElementById('paperBtnCapture');
  const btnRet = document.getElementById('paperBtnRetake');
  const btnUpl = document.getElementById('paperBtnUpload');
  const hint   = document.getElementById('paperCameraHint');
  
  if (btnCap) btnCap.style.display = 'none';
  if (btnRet) btnRet.style.display = 'inline-block';
  if (btnUpl) btnUpl.style.display = 'inline-block';
  if (hint)   hint.textContent = 'Review foto di atas. Jika jelas, tap Upload.';
}

function retakePaper() {
  paperCapturedImage = null;
  const preview = document.getElementById('paperPreview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  
  const btnCap = document.getElementById('paperBtnCapture');
  const btnRet = document.getElementById('paperBtnRetake');
  const btnUpl = document.getElementById('paperBtnUpload');
  const hint   = document.getElementById('paperCameraHint');
  
  if (btnCap) btnCap.style.display = 'inline-block';
  if (btnRet) btnRet.style.display = 'none';
  if (btnUpl) btnUpl.style.display = 'none';
  if (hint)   hint.textContent = 'Arahkan kamera ke kertas. Pastikan 4 kotak hitam terlihat di sudut.';
}

/* ===== UPLOAD — Cloudinary direct browser upload ===== */
async function uploadPaper() {
  if (!paperCapturedImage) return;

  // 0. Check corner detection config
  let cfg;
  try {
    const { data, error } = await sb
      .from('Config')
      .select('mulai_pengumpulan, batas_pengumpulan_absensi, omr_require_corners')
      .single();
    cfg = data || {};
  } catch (e) { cfg = {}; }

  const requireCorners = cfg.omr_require_corners !== false;

  if (requireCorners) {
    const cornersOk = await checkPaperCorners(paperCapturedImage);
    if (cornersOk === false) {
      showStatus('❌ 4 sudut kertas wajib terlihat. Silakan foto ulang.', 'error');
      retakePaper();
      return;
    }
  }

    // 1. Check upload window from Config
  
  const now = new Date();
  const jh = parseInt(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',hour:'numeric',hour12:false}).format(now));
  const jm = parseInt(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',minute:'numeric'}).format(now));
  const tv = jh + (jm / 100);
  const us = cfg.mulai_pengumpulan ?? 0;
  const ue = cfg.batas_pengumpulan_absensi ?? 24;
  
  if (tv < us || tv > ue) {
    showStatus(`Upload bukti absensi hanya diperbolehkan pukul ${decimalToTime(us)} - ${decimalToTime(ue)} WIB`, 'error');
    return;
  }
  
  const btn = document.getElementById('paperBtnUpload');
  if (btn) { btn.disabled = true; btn.textContent = 'Mengupload...'; }
  showLoading(true);
  
  try {
    // 2. Convert base64 dataURL → Blob for multipart upload
    const fetchRes = await fetch(paperCapturedImage);
    const blob = await fetchRes.blob();
    
    const formData = new FormData();
    formData.append('file', blob, `Absensi_${currentEkstra}_${getJakartaDateString()}.jpg`);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'arknet_absensi');
    
    // 3. Upload directly to Cloudinary (zero bandwidth through your server)
    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );
    
    const data = await uploadRes.json();
    if (!data.secure_url) {
      throw new Error(data.error?.message || 'Upload gagal');
    }
    
    // 4. Save the CDN URL to Supabase (only text, no image bytes)
    const dateStr = getJakartaDateString();
    const { error: dbErr } = await sb.from('AttendanceProof').upsert({
      ekstra: currentEkstra,
      date: dateStr,
      semester: currentSemester,
      photo_url: data.secure_url,   // <-- Cloudinary CDN link
      uploaded_by: currentOperator,
      note: ''
    }, { onConflict: 'ekstra,date,semester' });
    
    if (dbErr) throw dbErr;
    
    showStatus('✓ Bukti absensi berhasil diupload', 'ok');

    // Increment page counter
        // Increment page counters (print tab + camera tab)
    ['paperUploadCounter', 'paperCameraUploadCounter'].forEach(id => {
      const counterEl = document.getElementById(id);
      if (counterEl) {
        const parts = counterEl.textContent.split('/');
        const current = parseInt(parts[0]) || 0;
        const total = parseInt(parts[1]) || 1;
        const next = current + 1;
        counterEl.textContent = next + '/' + total;
        if (next >= total) {
          counterEl.style.background = 'var(--green)';
          showStatus('✓ Semua lembar sudah diupload!', 'ok');
        }
      }
    });

    retakePaper();
  } catch (err) {
    showStatus('Error upload: ' + err.message, 'error');
  }
  
  if (btn) { btn.disabled = false; btn.textContent = '⬆️ Upload'; }
  showLoading(false);
}

/* ===== UTILS ===== */
function decimalToTime(decimal) {
  if (decimal === null || decimal === undefined) return "00:00";
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 100);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

/* ===== CORNER DETECTION (simple) ===== */
async function checkPaperCorners(imageDataUrl) {
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = imageDataUrl;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const w = canvas.width, h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h).data;

    const margin = Math.min(w, h) * 0.05;
    const search = Math.min(w, h) * 0.18;
    const quadrants = [
      { x0: margin, y0: margin },
      { x0: w - search - margin, y0: margin },
      { x0: margin, y0: h - search - margin },
      { x0: w - search - margin, y0: h - search - margin }
    ];

    let found = 0;
    for (const q of quadrants) {
      let darkest = 255;
      for (let y = q.y0; y < q.y0 + search; y += 6) {
        for (let x = q.x0; x < q.x0 + search; x += 6) {
          const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
          const b = (imgData[idx] + imgData[idx+1] + imgData[idx+2]) / 3;
          if (b < darkest) darkest = b;
        }
      }
      if (darkest < 60) found++;
    }
    return found >= 3; // allow 1 corner to be obscured
  } catch (e) {
    return null; // inconclusive
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}