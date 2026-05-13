// ==========================================
// color-science.js
// ==========================================

// --- 1. CORE PIXEL PROCESSING ---
function processImageData(sourceData, inType, outType, curveFunction) {
    // Create a blank image data array the exact same size as the source
    const newImageData = new ImageData(
        new Uint8ClampedArray(sourceData.data), 
        sourceData.width, 
        sourceData.height
    );
    
    const data = sourceData.data;
    const newData = newImageData.data;
    const sensitivity = 0.5; // Your sensitivity multiplier

    for (let i = 0; i < data.length; i += 4) {
        let [h, s, l] = rgbToHsl(data[i], data[i+1], data[i+2]);
        let inputVal = (inType === 'h') ? h : (inType === 's') ? s : l;
        
        // Pass the input to the curve function that was handed to us
        let curveY = curveFunction(inputVal);
        let delta = ((curveY - 0.5) * 2) * sensitivity;
        
        if (outType === 'h') {
            h += delta;
            if (h > 1) h -= 1;
            if (h < 0) h += 1;
        } 
        else if (outType === 's') s = Math.max(0, Math.min(1, s + delta));
        else if (outType === 'l') l = Math.max(0, Math.min(1, l + delta));

        let [r, g, b] = hslToRgb(h, s, l);
        newData[i] = r; newData[i+1] = g; newData[i+2] = b; 
        // Alpha (data[i+3]) remains untouched by default in Uint8ClampedArray copy
    }
    return newImageData;
}

// --- 2. COLOR MATH UTILITIES ---
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } 
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; } 
    else {
        const hue2rgb = (p, q, t) => {
            if(t < 0) t += 1; if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}