// --- 1. CORE VARIABLES ---
const uploadInput = document.getElementById('imageUpload');
const imgCanvas = document.getElementById('imageCanvas');
const imgCtx = imgCanvas.getContext('2d');
const inSelect = document.getElementById('inputChannel');
const outSelect = document.getElementById('outputChannel');
const resetBtn = document.getElementById('resetBtn');
const saveBtn = document.getElementById('saveBtn');

let originalImage = new Image();

// NEW: Split image data into Proxy (Preview) and Full Res (Export)
let previewOriginalData = null;
let fullResOriginalData = null;
const MAX_PREVIEW_SIZE = 1000; // The canvas will never be wider/taller than this

// --- 2. CURVE ENGINE (SPLINES & UI) ---
const curveCanvas = document.getElementById('curveCanvas');
const curveCtx = curveCanvas.getContext('2d');
const padding = 20;

let points = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];
let draggingPoint = null;
let currentSpline = null;

function toScreen(nx, ny) {
    const innerW = curveCanvas.width - padding * 2;
    const innerH = curveCanvas.height - padding * 2;
    return {
        x: padding + nx * innerW,
        y: padding + (1 - ny) * innerH
    };
}

function fromScreen(px, py) {
    const innerW = curveCanvas.width - padding * 2;
    const innerH = curveCanvas.height - padding * 2;
    let nx = (px - padding) / innerW;
    let ny = 1 - ((py - padding) / innerH);
    return {
        x: Math.max(0, Math.min(1, nx)),
        y: Math.max(0, Math.min(1, ny))
    };
}

function createMonotoneCubicSpline(points, isCyclic = false) {
    const n = points.length;
    if (n < 2) return (x) => x;

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const ms = new Array(n).fill(0);

    const dxs = new Array(n - 1), dys = new Array(n - 1), mSecants = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
        dxs[i] = xs[i + 1] - xs[i];
        dys[i] = ys[i + 1] - ys[i];
        mSecants[i] = dys[i] / dxs[i];
    }

    // NEW: Handle Cyclic Boundaries
    if (isCyclic && n >= 2) {
        // Calculate the secant line from the point BEFORE the start (wrapped from the end)
        // Since the graph is 0.0 to 1.0, the point before 0 is (xs[n-2] - 1.0)
        const dx_prev = 1 - xs[n - 2];
        const dy_prev = ys[0] - ys[n - 2];
        const mSecant_prev = dy_prev / dx_prev;

        // Calculate the perfectly smooth wrap-around tangent
        if (mSecant_prev * mSecants[0] <= 0) {
            ms[0] = 0;
        } else {
            ms[0] = (dx_prev + dxs[0]) / (dxs[0] / mSecant_prev + dx_prev / mSecants[0]);
        }

        // Lock the end slope to identically match the start slope
        ms[n - 1] = ms[0];
    } else {
        // Standard hard-boundary tangents
        ms[0] = mSecants[0];
        ms[n - 1] = mSecants[n - 2];
    }

    // Calculate interior tangents
    for (let i = 1; i < n - 1; i++) {
        if (mSecants[i - 1] * mSecants[i] <= 0) ms[i] = 0;
        else ms[i] = (dxs[i - 1] + dxs[i]) / (dxs[i] / mSecants[i - 1] + dxs[i - 1] / mSecants[i]);
    }

    // Return the interpolation function
    return function (x) {
        if (x <= xs[0]) return ys[0];
        if (x >= xs[n - 1]) return ys[n - 1];

        let i = 0;
        while (xs[i + 1] < x) i++;

        const h = dxs[i];
        const t = (x - xs[i]) / h;
        const t2 = t * t;
        const t3 = t2 * t;

        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        return h00 * ys[i] + h10 * h * ms[i] + h01 * ys[i + 1] + h11 * h * ms[i + 1];
    };
}

function updateSpline() {
    const isHue = inSelect.value === 'h';
    currentSpline = createMonotoneCubicSpline(points, isHue);
}

function getCurveValue(x) {
    if (!currentSpline) updateSpline();
    return currentSpline(x);
}

function drawCurve() {
    curveCtx.clearRect(0, 0, curveCanvas.width, curveCanvas.height);
    const innerW = curveCanvas.width - padding * 2;
    const innerH = curveCanvas.height - padding * 2;

    curveCtx.lineWidth = 1;

    // Grid
    curveCtx.strokeStyle = '#555';
    curveCtx.beginPath();
    for (let i = 1; i < 4; i++) {
        let yLine = padding + innerH * (i / 4);
        let xLine = padding + innerW * (i / 4);
        curveCtx.moveTo(padding, yLine); curveCtx.lineTo(curveCanvas.width - padding, yLine);
        curveCtx.moveTo(xLine, padding); curveCtx.lineTo(xLine, curveCanvas.height - padding);
    }
    curveCtx.stroke();

    // Baseline
    curveCtx.strokeStyle = '#999';
    curveCtx.beginPath();
    curveCtx.moveTo(padding, curveCanvas.height / 2);
    curveCtx.lineTo(curveCanvas.width - padding, curveCanvas.height / 2);
    curveCtx.stroke();

    // Line
    curveCtx.strokeStyle = '#fff';
    curveCtx.lineWidth = 2;
    curveCtx.beginPath();
    for (let i = 0; i <= innerW; i++) {
        const mathX = i / innerW;
        const mathY = getCurveValue(mathX);
        const pos = toScreen(mathX, mathY);
        if (i === 0) curveCtx.moveTo(pos.x, pos.y);
        else curveCtx.lineTo(pos.x, pos.y);
    }
    curveCtx.stroke();

    // Points
    curveCtx.fillStyle = '#007bff';
    points.forEach(p => {
        const pos = toScreen(p.x, p.y);
        curveCtx.beginPath();
        curveCtx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
        curveCtx.fill();
    });
}

// --- 3. CURVE MOUSE EVENTS ---
function getMousePos(e) {
    const rect = curveCanvas.getBoundingClientRect();
    return fromScreen(e.clientX - rect.left, e.clientY - rect.top);
}

// Only update the PREVIEW image while interacting
curveCanvas.addEventListener('mousedown', e => {
    const pos = getMousePos(e);
    for (let i = 0; i < points.length; i++) {
        const dx = points[i].x - pos.x;
        const dy = points[i].y - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.05) { draggingPoint = i; return; }
    }
    points.push(pos);
    points.sort((a, b) => a.x - b.x);
    draggingPoint = points.indexOf(pos);
    updateSpline(); drawCurve(); applyFilterToPreview();
});

curveCanvas.addEventListener('mousemove', e => {
    if (draggingPoint !== null) {
        const pos = getMousePos(e);
        const isHueInput = inSelect.value === 'h';

        // Handle the First Point
        if (draggingPoint === 0) {
            pos.x = 0; // Lock X to 0
            if (isHueInput) {
                points[points.length - 1].y = pos.y; // Mirror Y to the last point
            }
        }
        // Handle the Last Point
        else if (draggingPoint === points.length - 1) {
            pos.x = 1; // Lock X to 1
            if (isHueInput) {
                points[0].y = pos.y; // Mirror Y to the first point
            }
        }

        // Update the point
        points[draggingPoint] = pos;

        // Keep the array sorted by X
        points.sort((a, b) => a.x - b.x);
        draggingPoint = points.indexOf(pos);

        // Render and Process
        updateSpline();
        drawCurve();
        applyFilterToPreview();
    }
});

curveCanvas.addEventListener('mouseup', () => draggingPoint = null);
curveCanvas.addEventListener('mouseleave', () => draggingPoint = null);
curveCanvas.addEventListener('dblclick', e => {
    const pos = getMousePos(e);
    for (let i = 1; i < points.length - 1; i++) {
        const dx = points[i].x - pos.x;
        const dy = points[i].y - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.05) {
            points.splice(i, 1);
            updateSpline(); drawCurve(); applyFilterToPreview();
            return;
        }
    }
});

// --- 4. IMAGE PROCESSING ---
uploadInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => originalImage.src = event.target.result;
    reader.readAsDataURL(file);
});

originalImage.onload = () => {
    // 1. Calculate scaling for the Proxy/Preview
    let scale = 1;
    if (originalImage.width > MAX_PREVIEW_SIZE || originalImage.height > MAX_PREVIEW_SIZE) {
        scale = Math.min(MAX_PREVIEW_SIZE / originalImage.width, MAX_PREVIEW_SIZE / originalImage.height);
    }

    const previewWidth = Math.floor(originalImage.width * scale);
    const previewHeight = Math.floor(originalImage.height * scale);

    // 2. Set up visible canvas for Preview
    imgCanvas.width = previewWidth;
    imgCanvas.height = previewHeight;
    imgCtx.drawImage(originalImage, 0, 0, previewWidth, previewHeight);
    previewOriginalData = imgCtx.getImageData(0, 0, previewWidth, previewHeight);

    // 3. Set up an invisible, offscreen canvas for Full Res data
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = originalImage.width;
    offscreenCanvas.height = originalImage.height;
    const offscreenCtx = offscreenCanvas.getContext('2d');
    offscreenCtx.drawImage(originalImage, 0, 0);
    fullResOriginalData = offscreenCtx.getImageData(0, 0, originalImage.width, originalImage.height);

    applyFilterToPreview();
};

// Wrapper to process the fast preview
function applyFilterToPreview() {
    if (!previewOriginalData) return;
    // Pass the HTML select values and the getCurveValue function
    const processedData = processImageData(
        previewOriginalData, 
        inSelect.value, 
        outSelect.value, 
        getCurveValue
    );
    imgCtx.putImageData(processedData, 0, 0);
}

[inSelect, outSelect].forEach(el => el.addEventListener('change', () => resetBtn.click()));
inSelect.addEventListener('click', () => { document.getElementById('xAxisPreview').className = inSelect.value; });
outSelect.addEventListener('click', () => { document.getElementById('yAxisPreview').className = outSelect.value; });

resetBtn.addEventListener('click', () => {
    points = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];
    updateSpline(); drawCurve(); applyFilterToPreview();
});

function showOriginal() {
    if (!previewOriginalData) return;
    // Draw the pristine, unaltered original proxy data to the canvas
    imgCtx.putImageData(previewOriginalData, 0, 0);
}

function showEdited() {
    if (!previewOriginalData) return;
    // Re-run the filter to instantly show the edited version again
    applyFilterToPreview();
}

// Mouse events for desktop
imgCanvas.addEventListener('mouseover', showOriginal);
imgCanvas.addEventListener('mouseleave', showEdited);

// Touch events for mobile/tablets
imgCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Stop screen from scrolling/zooming
    showOriginal();
});
imgCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    showEdited();
});

// --- 5. EXPORT / SAVE (Now uses Full Res Data) ---
saveBtn.addEventListener('click', () => {
    if (!fullResOriginalData) { alert("Please upload an image first."); return; }

    // Temporarily change button text to show it's processing the massive file
    const originalBtnText = saveBtn.innerText;
    saveBtn.innerText = "Processing High-Res Image...";
    saveBtn.disabled = true;

    // We use a small timeout so the browser has time to render the button text change
    // before the heavy mathematical for-loop locks up the main thread.
    setTimeout(() => {
        // 1. Process the massive original pixel array
        const processedFullResData = processImageData(
            fullResOriginalData,
            inSelect.value,
            outSelect.value,
            getCurveValue
        );

        // 2. Put it on a temporary offscreen canvas
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = fullResOriginalData.width;
        exportCanvas.height = fullResOriginalData.height;
        const exportCtx = exportCanvas.getContext('2d');
        exportCtx.putImageData(processedFullResData, 0, 0);

        // 3. Export to file
        const imageURL = exportCanvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = imageURL;
        downloadLink.download = 'edited-high-res.png';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // 4. Restore UI
        saveBtn.innerText = originalBtnText;
        saveBtn.disabled = false;
    }, 50);
});

updateSpline(); drawCurve();
