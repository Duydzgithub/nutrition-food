from cohere import ClientV2
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
import requests
from clarifai.client.model import Model
import os
import asyncio


app = Flask(__name__)
# Giới hạn kích thước upload 10MB (tránh ảnh điện thoại quá lớn gây lỗi)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

# Cấu hình CORS theo ENV (mặc định cho localhost)
ALLOWED_ORIGINS = os.environ.get(
    'ALLOWED_ORIGINS',
    'http://localhost:5500,http://127.0.0.1:5500,http://localhost:5000,http://127.0.0.1:5000'
).split(',')
# Hỗ trợ wildcard qua ENV: đặt ALLOWED_ORIGINS="*" để cho phép mọi origin (chỉ nên dùng tạm thời khi debug)
_wildcard = any(o.strip() == '*' for o in ALLOWED_ORIGINS)
ORIGINS_FOR_CORS = '*' if _wildcard else ALLOWED_ORIGINS
# Khi dùng wildcard, KHÔNG bật credentials để tránh xung đột trình duyệt
CORS(
    app,
    resources={r"/*": {"origins": ORIGINS_FOR_CORS}},
    supports_credentials=False if _wildcard else True,
    methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=86400,
)

# Lấy API keys từ ENV (không hardcode)
COHERE_API_KEY = os.environ.get('COHERE_API_KEY', '')
PAT = os.environ.get('CLARIFAI_PAT', '')  # Clarifai PAT
CALORIE_API_KEY = os.environ.get('CALORIE_API_KEY', '')

# Health check / root endpoint (tránh 404 khi truy cập URL gốc trên Render)
@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'status': 'ok',
        'service': 'Nutrition Food API',
        'endpoints': ['/predict (POST)', '/chat (POST)', '/ask_ai (POST)']
    }), 200

@app.route('/ask_ai', methods=['POST'])
@cross_origin(origins=ORIGINS_FOR_CORS)
def ask_ai():
    data = request.get_json()
    prompt = data.get('prompt', '')
    if not prompt:
        return jsonify({'error': 'No prompt provided'}), 400
    try:
        if not COHERE_API_KEY:
            return jsonify({'error': 'Missing COHERE_API_KEY'}), 500
        print(f"[ASK_AI] Prompt gửi lên Cohere: {prompt}")
        client = ClientV2(api_key=COHERE_API_KEY)
        ai_answer = ""
        try:
            response = client.chat(
                model="command-a-03-2025",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3
            )
            # Lấy kết quả theo chuẩn tài liệu Cohere
            ai_answer = response.message.content[0].text if response.message and response.message.content else ""
            print(f"[ASK_AI] Cohere trả về: {ai_answer}")
            if not ai_answer.strip():
                ai_answer = "[AI Warning] Cohere không trả về nội dung. Hãy kiểm tra lại prompt hoặc quota API."
        except Exception as e:
            ai_answer = f"[AI Error] {str(e)}"
            print(f"[ASK_AI] Lỗi Cohere: {ai_answer}")
        return jsonify({'result': ai_answer})
    except Exception as e:
        print(f"[ASK_AI] Lỗi tổng: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Clarifai & CalorieNinjas config
MODEL_URL = "https://clarifai.com/clarifai/main/models/food-item-recognition"

@app.route('/predict', methods=['POST'])
@cross_origin(origins=ORIGINS_FOR_CORS)
def predict():
    try:
        asyncio.set_event_loop(asyncio.new_event_loop())
    except Exception:
        pass
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
    if not PAT:
        return jsonify({'error': 'Missing CLARIFAI_PAT'}), 500
    image = request.files['image']
    image_bytes = image.read()
    try:
        model_prediction = Model(url=MODEL_URL, pat=PAT).predict_by_bytes(
            input_bytes=image_bytes,
            input_type="image"
        )
        concepts = model_prediction.outputs[0].data.concepts
        if not concepts:
            return jsonify({'error': 'No food detected'}), 200
        food_name = concepts[0].name
        # Call CalorieNinjas
        nutrition = None
        if CALORIE_API_KEY:
            api_url = f'https://api.calorieninjas.com/v1/nutrition?query={food_name}'
            headers = {'X-Api-Key': CALORIE_API_KEY}
            response = requests.get(api_url, headers=headers, timeout=20)
            if response.status_code == requests.codes.ok:
                nutrition = response.json()
        else:
            print('[PREDICT] Warning: Missing CALORIE_API_KEY, bỏ qua dinh dưỡng')

        # In nutrition để debug
        import json
        print(f"[PREDICT] Nutrition raw: {nutrition}")
        nutrition_str = json.dumps(nutrition, ensure_ascii=False)
        prompt = (
            f"Hãy phân tích món ăn '{food_name}' với thông tin dinh dưỡng sau: {nutrition_str}. "
            f"Đưa ra nhận xét về lợi ích, rủi ro sức khỏe (nếu có) và gợi ý ăn uống lành mạnh. "
            f"(Phân tích ngắn gọn dễ hiểu, hướng tới người tiêu dùng)"
        )
        print(f"[PREDICT] Prompt gửi lên Cohere: {prompt}")
        ai_answer = ""
        if not COHERE_API_KEY:
            ai_answer = "[AI Warning] Thiếu COHERE_API_KEY nên không thể gọi AI."
        else:
            try:
                client = ClientV2(api_key=COHERE_API_KEY)
                response = client.chat(
                    model="command-a-03-2025",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3
                )
                ai_answer = response.message.content[0].text if response.message and response.message.content else ""
                print(f"[PREDICT] Cohere trả về: {ai_answer}")
                if not ai_answer.strip():
                    ai_answer = "[AI Warning] Cohere không trả về nội dung. Hãy kiểm tra lại prompt hoặc quota API."
            except Exception as e:
                ai_answer = f"[AI Error] {str(e)}"
                print(f"[PREDICT] Lỗi Cohere: {ai_answer}")

        return jsonify({
            'food_name': food_name,
            'probability': concepts[0].value,
            'nutrition': nutrition,
            'ai_answer': ai_answer
        })
    except Exception as e:
        print(f"[PREDICT] Lỗi tổng: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/chat', methods=['POST', 'OPTIONS'])
@cross_origin(origins=ORIGINS_FOR_CORS)  # Chỉ cho phép các origin cấu hình
def chat():
    # Trả nhanh cho preflight
    if request.method == 'OPTIONS':
        return ('', 204)
    data = request.get_json()
    user_message = data.get('message', '')
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    try:
        if not COHERE_API_KEY:
            return jsonify({'error': 'Missing COHERE_API_KEY'}), 500
        client = ClientV2(api_key=COHERE_API_KEY)
        response = client.chat(
            model="command-a-03-2025",
            messages=[{"role": "user", "content": user_message}],
            temperature=0.3
        )
        ai_answer = response.message.content[0].text if response.message and response.message.content else ""
        if not ai_answer.strip():
            ai_answer = "[AI Warning] Cohere không trả về nội dung. Hãy kiểm tra lại prompt hoặc quota API."
        return jsonify({"response": ai_answer})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)

# Xử lý lỗi file quá lớn (413) để trả JSON rõ ràng
from werkzeug.exceptions import RequestEntityTooLarge

@app.errorhandler(413)
def handle_large_file(e: RequestEntityTooLarge):
    return jsonify({'error': 'File quá lớn, tối đa 10MB'}), 413
