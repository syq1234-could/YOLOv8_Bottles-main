const imageInput = document.getElementById("imageInput");
const chooseBtn = document.getElementById("chooseBtn");
const dropZone = document.getElementById("dropZone");
const previewArea = document.getElementById("previewArea");
const previewImage = document.getElementById("previewImage");
const detectBtn = document.getElementById("detectBtn");
const resetBtn = document.getElementById("resetBtn");
const loading = document.getElementById("loading");
const resultPanel = document.getElementById("resultPanel");
const resultImage = document.getElementById("resultImage");
const detectionList = document.getElementById("detectionList");
const summary = document.getElementById("summary");
const errorPanel = document.getElementById("errorPanel");
const statsPanel = document.getElementById("statsPanel");
const timeInfo = document.getElementById("timeInfo");
const batchResultPanel = document.getElementById("batchResultPanel");
const batchResultGrid = document.getElementById("batchResultGrid");
const singleResultGrid = document.getElementById("singleResultGrid");

let selectedFiles = [];
let isBatch = false;
let detectStartTime = 0;

chooseBtn.addEventListener("click", () => imageInput.click());
dropZone.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", (event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
        if (files.length === 1) {
            isBatch = false;
            setSelectedFile(files[0]);
        } else {
            isBatch = true;
            setSelectedFiles(files);
        }
    }
});

["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("drag-over");
    });
});

["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("drag-over");
    });
});

dropZone.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
        if (files.length === 1) {
            isBatch = false;
            setSelectedFile(files[0]);
        } else {
            isBatch = true;
            setSelectedFiles(files);
        }
    }
});

resetBtn.addEventListener("click", resetPage);
detectBtn.addEventListener("click", detectImage);

function setSelectedFile(file) {
    clearError();

    if (!file.type.startsWith("image/")) {
        showError("请选择图片文件。");
        return;
    }

    selectedFiles = [file];
    previewImage.src = URL.createObjectURL(file);
    previewArea.classList.remove("hidden");
    resultPanel.classList.add("hidden");
    detectBtn.textContent = "开始检测";
}

function setSelectedFiles(files) {
    clearError();

    const validFiles = files.filter(f => f.type.startsWith("image/"));
    if (validFiles.length === 0) {
        showError("请选择图片文件。");
        return;
    }

    selectedFiles = validFiles;
    previewImage.src = URL.createObjectURL(validFiles[0]);
    previewArea.classList.remove("hidden");
    resultPanel.classList.add("hidden");
    detectBtn.textContent = `开始检测 (${validFiles.length}张)`;
}

async function detectImage() {
    if (selectedFiles.length === 0) {
        showError("请先选择图片。");
        return;
    }

    clearError();
    loading.classList.remove("hidden");
    resultPanel.classList.add("hidden");
    detectBtn.disabled = true;

    detectStartTime = Date.now();

    if (isBatch && selectedFiles.length > 1) {
        await detectBatch();
    } else {
        await detectSingle(selectedFiles[0]);
    }

    loading.classList.add("hidden");
    detectBtn.disabled = false;
    detectBtn.textContent = isBatch ? `开始检测 (${selectedFiles.length}张)` : "开始检测";
}

async function detectSingle(file) {
    const formData = new FormData();
    formData.append("image", file);

    try {
        const response = await fetch("/api/predict", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "检测失败，请检查后端服务。");
        }

        const elapsed = ((Date.now() - detectStartTime) / 1000).toFixed(2);
        renderResult(data, elapsed);
    } catch (error) {
        showError(error.message);
    }
}

async function detectBatch() {
    batchResultGrid.innerHTML = "";
    const results = [];

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const formData = new FormData();
        formData.append("image", file);

        try {
            const response = await fetch("/api/predict", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                results.push({ file, data, index: i });
                renderBatchCard({ file, data, index: i });
            }
        } catch (error) {
            console.error(`图片${i + 1}检测失败:`, error);
        }
    }

    if (results.length > 0) {
        batchResultPanel.classList.remove("hidden");
        singleResultGrid.classList.add("hidden");
        resultPanel.classList.remove("hidden");

        const totalCount = results.reduce((sum, r) => sum + r.data.count, 0);
        summary.textContent = `共检测 ${results.length} 张图片，发现 ${totalCount} 个目标`;

        const elapsed = ((Date.now() - detectStartTime) / 1000).toFixed(2);
        timeInfo.textContent = `总耗时 ${elapsed}s`;
        timeInfo.classList.remove("hidden");
    } else {
        showError("所有图片检测失败。");
    }
}

function renderBatchCard({ file, data, index }) {
    const card = document.createElement("div");
    card.className = "batch-card";

    const stats = computeStats(data.detections);
    const statsHtml = stats.map(s => `<span class="stat-tag">${s.name} x${s.count}</span>`).join("");

    card.innerHTML = `
        <img src="${data.result_image}?t=${Date.now()}" alt="结果${index + 1}">
        <div class="batch-card-info">
            <p><strong>图片 ${index + 1}</strong> <small>${file.name}</small></p>
            <p>检测到 ${data.count} 个目标</p>
            <div class="stat-tags">${statsHtml}</div>
        </div>
    `;
    batchResultGrid.appendChild(card);
}

function renderResult(data, elapsed) {
    resultImage.src = `${data.result_image}?t=${Date.now()}`;
    summary.textContent = `共检测到 ${data.count} 个目标`;

    if (elapsed) {
        timeInfo.textContent = `耗时 ${elapsed}s`;
        timeInfo.classList.remove("hidden");
    }

    // 统计信息
    const stats = computeStats(data.detections);
    statsPanel.innerHTML = "";
    if (stats.length > 0) {
        stats.forEach(s => {
            const tag = document.createElement("div");
            tag.className = "stat-card";
            tag.innerHTML = `<strong>${s.name}</strong><span>x${s.count}</span>`;
            statsPanel.appendChild(tag);
        });
    } else {
        statsPanel.innerHTML = '<div class="stat-card empty">未检测到目标</div>';
    }

    // 检测明细
    detectionList.innerHTML = "";
    if (!data.detections.length) {
        detectionList.innerHTML = '<div class="detection-item"><strong>未检测到目标</strong><span>可以尝试更清晰的图片</span></div>';
    } else {
        data.detections.forEach((item, index) => {
            const row = document.createElement("div");
            row.className = "detection-item";
            row.innerHTML = `
                <div>
                    <strong>${index + 1}. ${item.name}</strong>
                    <small>类别编号：${item.class_id}</small>
                </div>
                <span>${(item.confidence * 100).toFixed(1)}%</span>
            `;
            detectionList.appendChild(row);
        });
    }

    batchResultPanel.classList.add("hidden");
    singleResultGrid.classList.remove("hidden");
    resultPanel.classList.remove("hidden");
}

function computeStats(detections) {
    const map = {};
    detections.forEach(d => {
        map[d.name] = (map[d.name] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
}

function resetPage() {
    selectedFiles = [];
    isBatch = false;
    imageInput.value = "";
    previewImage.src = "";
    resultImage.src = "";
    previewArea.classList.add("hidden");
    resultPanel.classList.add("hidden");
    batchResultPanel.classList.add("hidden");
    singleResultGrid.classList.remove("hidden");
    statsPanel.innerHTML = "";
    timeInfo.classList.add("hidden");
    clearError();
}

function showError(message) {
    errorPanel.textContent = message;
    errorPanel.classList.remove("hidden");
}

function clearError() {
    errorPanel.textContent = "";
    errorPanel.classList.add("hidden");
}
