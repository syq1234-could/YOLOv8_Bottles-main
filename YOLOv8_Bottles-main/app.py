from pathlib import Path
from uuid import uuid4

import cv2
from flask import Flask, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model" / "weights" / "best.pt"
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "bmp", "webp"}

CLASS_NAME_MAP = {
    "прозрачная": "透明瓶",
    "цветная": "有色瓶",
    "мусор": "垃圾/杂物",
}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

model = None


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_model():
    global model

    if model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"模型文件不存在：{MODEL_PATH}")

        from ultralytics import YOLO

        model = YOLO(str(MODEL_PATH))

    return model


def display_name(raw_name: str) -> str:
    return CLASS_NAME_MAP.get(raw_name, raw_name)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/outputs/<path:filename>")
def output_file(filename):
    return send_from_directory(OUTPUT_DIR, filename)


@app.route("/api/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify(success=False, error="没有收到图片文件。"), 400

    file = request.files["image"]

    if file.filename == "":
        return jsonify(success=False, error="请选择图片文件。"), 400

    if not allowed_file(file.filename):
        return jsonify(success=False, error="图片格式不支持，请上传 JPG、PNG、BMP 或 WEBP。"), 400

    UPLOAD_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    safe_name = secure_filename(file.filename)
    suffix = Path(safe_name).suffix.lower()
    unique_name = f"{uuid4().hex}{suffix}"
    upload_path = UPLOAD_DIR / unique_name
    output_name = f"{upload_path.stem}_result.jpg"
    output_path = OUTPUT_DIR / output_name

    file.save(upload_path)

    try:
        detector = get_model()
        results = detector(str(upload_path), conf=0.25)
        result = results[0]

        plotted_image = result.plot()
        # 将结果图上的俄语标签替换为中文
        cn_names = {0: '透明瓶', 1: '有色瓶', 2: '垃圾/杂物'}
        result.names = cn_names
        plotted_image = result.plot()
        cv2.imwrite(str(output_path), plotted_image)

        detections = []
        names = result.names

        for box in result.boxes:
            class_id = int(box.cls[0].item())
            confidence = float(box.conf[0].item())
            raw_name = names.get(class_id, str(class_id))
            xyxy = [round(float(value), 2) for value in box.xyxy[0].tolist()]

            detections.append({
                "class_id": class_id,
                "name": display_name(raw_name),
                "raw_name": raw_name,
                "confidence": confidence,
                "box": xyxy,
            })

        return jsonify(
            success=True,
            count=len(detections),
            detections=detections,
            result_image=f"/outputs/{output_name}",
        )

    except Exception as exc:
        return jsonify(success=False, error=f"检测失败：{exc}"), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5002, debug=False)
