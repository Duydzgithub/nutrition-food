import requests
from clarifai.client.model import Model

# Hàm gửi ảnh cục bộ dưới dạng bytes tới Clarifai
def predict_food(image_path, model_url, pat):
    try:
        # Đọc ảnh từ đường dẫn cục bộ
        with open(image_path, "rb") as image_file:
            image_bytes = image_file.read()
        
        # Gọi API Clarifai với ảnh dạng bytes
        model_prediction = Model(url=model_url, pat=pat).predict_by_bytes(
            input_bytes=image_bytes,
            input_type="image"
        )
        
        # Lấy danh sách các concepts (món ăn nhận diện được)
        concepts = model_prediction.outputs[0].data.concepts
        return concepts
    except Exception as e:
        print(f"Clarifai Error: {str(e)}")
        return None

# Hàm gọi CalorieNinjas API để lấy thông tin dinh dưỡng
def get_nutrition_info(food_name):
    api_url = 'https://api.calorieninjas.com/v1/nutrition?query='
    headers = {'X-Api-Key': 'YAUwnJbm2FnEJNxSnCAzDQ==CnSPSycr1OSpeZZw'}
    try:
        response = requests.get(api_url + food_name, headers=headers)
        if response.status_code == requests.codes.ok:
            return response.json()
        else:
            print(f"CalorieNinjas Error: {response.status_code}, {response.text}")
            return None
    except Exception as e:
        print(f"CalorieNinjas Error: {str(e)}")
        return None

# Tham số đầu vào
image_path = "C:/Users/Admin/Downloads/Red_Apple.jpg"  # Đường dẫn ảnh cục bộ
model_url = "https://clarifai.com/clarifai/main/models/food-item-recognition"
pat = "9cc0957ed5924ae598ac316dd7f9d1dd"  # Personal Access Token của bạn

# Bước 1: Nhận diện món ăn từ ảnh
concepts = predict_food(image_path, model_url, pat)
if concepts:
    # Lấy tên món ăn có xác suất cao nhất
    food_name = concepts[0].name
    print(f"Món ăn nhận diện được: {food_name} (Xác suất: {concepts[0].value:.2f})")
    
    # Bước 2: Lấy thông tin dinh dưỡng từ CalorieNinjas
    nutrition_info = get_nutrition_info(food_name)
    if nutrition_info:
        print("Thông tin dinh dưỡng:")
        print(nutrition_info)
else:
    print("Không thể nhận diện món ăn từ ảnh.")