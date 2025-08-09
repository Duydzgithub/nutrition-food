// FoodNinja - Modern Culinary Logic
// API base configuration:
// - In development (localhost/127.0.0.1): use Flask at http://127.0.0.1:5000
// - In production: by default use relative path (works if you proxy at Netlify),
//   or override by adding a Nutrition Food/config.js with: window.API_BASE = 'https://<your-backend>'
const API_BASE = (window.API_BASE !== undefined)
  ? String(window.API_BASE)
  : ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:5000'
      : '');
// Debug: xem frontend đang gọi API ở đâu
try { console.log('[FoodNinja] API_BASE =', API_BASE || '(relative / same-origin)'); } catch (e) {}
const imageInput = document.getElementById('imageInput');
const uploadBtn = document.getElementById('uploadBtn');
const cameraBtn = document.getElementById('cameraBtn');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const resultDiv = document.getElementById('result');
const imagePreview = document.getElementById('imagePreview');
const mediaWrapper = document.querySelector('.media-frame-wrapper');
let imageBlob = null;
// PWA install hooks
let deferredPrompt = null;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const installText = document.getElementById('installText');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBanner) installBanner.classList.remove('hidden');
});
// Fallback: nếu không có beforeinstallprompt (iOS Safari), gợi ý Add to Home Screen
window.addEventListener('load', () => {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (installBanner && !isStandalone) {
    if (!deferredPrompt && isIOS) {
      installBanner.classList.remove('hidden');
      if (installText) installText.textContent = 'Trên iPhone, chọn Chia sẻ → Add to Home Screen để cài đặt ứng dụng';
      if (installBtn) installBtn.style.display = 'none';
    }
  }
});
if (installBtn) {
  installBtn.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (installBanner) installBanner.classList.add('hidden');
    console.log('[FoodNinja] install outcome:', outcome);
  };
}

// Hiển thị preview ảnh khi chọn file
imageInput.onchange = () => {
    if (imageInput.files[0]) {
        const url = URL.createObjectURL(imageInput.files[0]);
        imagePreview.innerHTML = `<img src="${url}" alt="Ảnh món ăn">`;
    }
};

// Upload ảnh từ file
uploadBtn.onclick = async () => {
    if (!imageInput.files[0]) {
        alert('Vui lòng chọn ảnh!');
        return;
    }
    imageBlob = imageInput.files[0];
    await sendImage(imageBlob);
};

// Camera capture for mobile & desktop (responsive frames)
if (cameraBtn) {
  cameraBtn.onclick = async () => {
    try {
      const constraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();

      // Hiện wrapper + video, ẩn canvas
      if (mediaWrapper) mediaWrapper.classList.remove('hidden');
      video.classList.remove('hidden');
      captureBtn.classList.remove('hidden');
      canvas.classList.add('hidden');
      imagePreview.innerHTML = '';
    } catch (err) {
      alert('Không thể truy cập camera: ' + err.message);
    }
  };
}

if (captureBtn) {
  captureBtn.onclick = async () => {
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);

    const tracks = (video.srcObject && video.srcObject.getTracks()) || [];
    tracks.forEach(t => t.stop());
    video.srcObject = null;

    video.classList.add('hidden');
    captureBtn.classList.add('hidden');
    canvas.classList.remove('hidden');

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      imageBlob = blob;
      const url = URL.createObjectURL(blob);
      imagePreview.innerHTML = `<img src="${url}" alt="Ảnh món ăn">`;
      // Ẩn toàn bộ khung media sau khi đã chụp
      if (mediaWrapper) mediaWrapper.classList.add('hidden');
      await sendImage(imageBlob);
    }, 'image/jpeg', 0.9);
  };
}

// Helper: escape HTML để tránh lỗi hiển thị/XSS nhẹ
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendImage(blob) {
  resultDiv.innerHTML = '<span class="spinner"></span> <span style="color:#4CAF50;">Đang nhận diện...</span>';
  const formData = new FormData();
  formData.append('image', blob);
  try {
  const url = API_BASE ? `${API_BASE}/predict` : '/predict';
  const res = await fetch(url, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.error) {
      resultDiv.innerHTML = '<span style="color:#FF6347;">Lỗi: ' + escapeHtml(data.error) + '</span>';
    } else {
      const prob = (data.probability || 0);
      if (prob < 0.4) {
        resultDiv.innerHTML = '<span style="color:#FF6347;">Không nhận diện được, vui lòng thử lại!</span>';
        pushGlobalHistory({
          title: 'Không nhận diện được',
          body: `Xác suất: ${(prob*100).toFixed(2)}%`,
        });
        return;
      }
      let html = `<b><span class=\"food-icon\">🍎</span> Món ăn:</b> <span style=\"color:#388E3C;\">${escapeHtml(data.food_name || '')}</span> <span style=\"font-size:0.95em;\">(Xác suất: ${(prob*100).toFixed(2)}%)</span><br>`;
      if (data.nutrition && data.nutrition.items && data.nutrition.items.length > 0) {
        html += '<b>🥗 Thông tin dinh dưỡng:</b><ul>';
        for (const [key, value] of Object.entries(data.nutrition.items[0])) {
          html += `<li><b>${escapeHtml(key)}:</b> ${escapeHtml(String(value))}</li>`;
        }
        html += '</ul>';
      } else {
        html += '<span style="color:#888;">Không tìm thấy thông tin dinh dưỡng.</span>';
      }
      // Thêm khối hiển thị trả lời AI ở dưới
      if (data.ai_answer) {
        const aiText = escapeHtml(String(data.ai_answer)).replace(/\n/g, '<br>');
        html += `
          <div class="ai-answer-card">
            <div class="ai-answer-title">🤖 Phân tích & gợi ý từ AI</div>
            <div class="ai-answer-content">${aiText}</div>
          </div>
        `;
      }
      resultDiv.innerHTML = html;
      // lưu lịch sử nhận diện toàn cục
      pushGlobalHistory({
        title: `Món: ${data.food_name || ''} (${(prob*100).toFixed(2)}%)`,
        body: data.ai_answer ? String(data.ai_answer) : 'Không có phân tích AI',
      });
    }
  } catch (e) {
    resultDiv.innerHTML = '<span style="color:#FF6347;">Lỗi kết nối server!</span>';
  }
}

// ===== Chatbot Floating UI Logic =====
const openChatbotBtn = document.getElementById('openChatbot');
const chatbotBox = document.getElementById('chatbotBox');
const closeChatbotBtn = document.getElementById('closeChatbot');
const chatbotForm = document.getElementById('chatbotForm');
const chatbotInput = document.getElementById('chatbotInput');
const chatbotMessages = document.getElementById('chatbotMessages');
const chatHistoryPanel = document.getElementById('chatHistoryPanel');
const toggleHistoryBtn = document.getElementById('toggleHistory');
const clearHistoryBtn = document.getElementById('clearHistory');
const globalHistoryPanel = document.getElementById('globalHistoryPanel');
const toggleGlobalHistoryBtn = document.getElementById('toggleGlobalHistory');
const clearGlobalHistoryBtn = document.getElementById('clearGlobalHistory');

// Chat history persistence in localStorage
const CHAT_HISTORY_KEY = 'foodninja_chat_history_v1';
const GLOBAL_HISTORY_KEY = 'foodninja_recognition_history_v1';
function loadHistory() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveHistory(items) {
  try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(items.slice(-100))); } catch {}
}
function renderHistoryPanel() {
  if (!chatHistoryPanel) return;
  const items = loadHistory();
  if (items.length === 0) {
    chatHistoryPanel.innerHTML = '<div style="color:#888;">Chưa có lịch sử.</div>';
    return;
  }
  chatHistoryPanel.innerHTML = items.map(it => `<div class="chatbot-msg ${it.role==='user'?'chatbot-msg-user':'chatbot-msg-ai'}">${escapeHtml(it.text)}</div>`).join('');
}
function loadGlobalHistory() {
  try { const raw = localStorage.getItem(GLOBAL_HISTORY_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveGlobalHistory(items) {
  try { localStorage.setItem(GLOBAL_HISTORY_KEY, JSON.stringify(items.slice(-100))); } catch {}
}
function renderGlobalHistory() {
  if (!globalHistoryPanel) return;
  const items = loadGlobalHistory();
  if (items.length === 0) {
    globalHistoryPanel.innerHTML = '<div style="color:#888;">Chưa có lịch sử nhận diện.</div>';
    return;
  }
  globalHistoryPanel.innerHTML = items.map(it => `
    <div class="history-item">
      <div class="history-title">${escapeHtml(it.title || '')}</div>
      <div class="history-body">${escapeHtml(String(it.body || '')).replace(/\n/g,'<br>')}</div>
    </div>
  `).join('');
}
function pushGlobalHistory(item) {
  const items = loadGlobalHistory();
  items.push({ ...item, time: Date.now() });
  saveGlobalHistory(items);
  if (globalHistoryPanel && !globalHistoryPanel.classList.contains('hidden')) renderGlobalHistory();
}
if (toggleHistoryBtn && chatHistoryPanel) {
  toggleHistoryBtn.onclick = () => {
    const hidden = chatHistoryPanel.classList.toggle('hidden');
    chatHistoryPanel.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (!hidden) renderHistoryPanel();
  };
}
if (clearHistoryBtn) {
  clearHistoryBtn.onclick = () => {
    saveHistory([]);
    renderHistoryPanel();
    // cũng dọn vùng chat hiện tại nếu muốn
    // chatbotMessages.innerHTML = '';
  };
}
if (toggleGlobalHistoryBtn && globalHistoryPanel) {
  toggleGlobalHistoryBtn.onclick = () => {
    const hidden = globalHistoryPanel.classList.toggle('hidden');
    globalHistoryPanel.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (!hidden) renderGlobalHistory();
  };
}
if (clearGlobalHistoryBtn) {
  clearGlobalHistoryBtn.onclick = () => {
    saveGlobalHistory([]);
    renderGlobalHistory();
  };
}

function appendMessage(text, role = 'ai') {
  const div = document.createElement('div');
  div.className = `chatbot-msg ${role === 'user' ? 'chatbot-msg-user' : 'chatbot-msg-ai'}`;
  div.textContent = text;
  chatbotMessages.appendChild(div);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  // lưu lịch sử
  const hist = loadHistory();
  hist.push({ role, text });
  saveHistory(hist);
}

if (openChatbotBtn && chatbotBox) {
  openChatbotBtn.onclick = () => {
    chatbotBox.style.display = 'flex';
    chatbotInput && chatbotInput.focus();
  };
}
if (closeChatbotBtn && chatbotBox) {
  closeChatbotBtn.onclick = () => {
    chatbotBox.style.display = 'none';
  };
}

if (chatbotForm) {
  chatbotForm.onsubmit = async (e) => {
    e.preventDefault();
    const msg = chatbotInput.value.trim();
    if (!msg) return;
    appendMessage(msg, 'user');
    chatbotInput.value = '';
    appendMessage('Đang soạn trả lời...', 'ai');
    try {
  const url = API_BASE ? `${API_BASE}/chat` : '/chat';
  const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      // thay thế tin nhắn "Đang soạn trả lời..."
      chatbotMessages.lastChild.remove();
      appendMessage(data.error ? `Lỗi: ${data.error}` : (data.response || 'Không có câu trả lời.'), 'ai');
    } catch (err) {
      chatbotMessages.lastChild.remove();
      appendMessage('Lỗi kết nối server!', 'ai');
    }
  };
}

// ===== Drag & Drop Upload Enhancements =====
const uploadBoxEl = document.getElementById('uploadBox');
const imageInputEl = document.getElementById('imageInput');
if (uploadBoxEl && imageInputEl) {
  uploadBoxEl.addEventListener('click', (e) => {
    if (e.target === uploadBoxEl || e.target.classList.contains('upload-icon')) {
      imageInputEl.click();
    }
  });
  uploadBoxEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBoxEl.classList.add('dragover');
  });
  uploadBoxEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadBoxEl.classList.remove('dragover');
  });
  uploadBoxEl.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBoxEl.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      imageInputEl.files = e.dataTransfer.files;
      const event = new Event('change');
      imageInputEl.dispatchEvent(event);
    }
  });
}
