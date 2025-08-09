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
      let html = `<b><span class="food-icon">🍎</span> Món ăn:</b> <span style="color:#388E3C;">${escapeHtml(data.food_name || '')}</span> <span style="font-size:0.95em;">(Xác suất: ${((data.probability||0)*100).toFixed(2)}%)</span><br>`;
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

function appendMessage(text, role = 'ai') {
  const div = document.createElement('div');
  div.className = `chatbot-msg ${role === 'user' ? 'chatbot-msg-user' : 'chatbot-msg-ai'}`;
  div.textContent = text;
  chatbotMessages.appendChild(div);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
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
