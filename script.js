(function() {
  // DOM Elements
  const rootColorInput = document.getElementById('rootColor');
  const rootColorText = document.getElementById('rootColorText');
  const harmonyModeSelect = document.getElementById('harmonyMode');
  const brightnessShiftInput = document.getElementById('brightnessShift');
  const brightnessValSpan = document.getElementById('brightnessVal');
  const paletteDisplay = document.getElementById('paletteDisplay');
  const cssCodeOutput = document.getElementById('cssCodeOutput');
  const btnRandomize = document.getElementById('btnRandomize');
  const btnExport = document.getElementById('btnExport');
  const btnCopyCss = document.getElementById('btnCopyCss');
  const exportModal = document.getElementById('exportModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCopyModal = document.getElementById('btnCopyModal');
  const exportTextarea = document.getElementById('exportTextarea');
  const toast = document.getElementById('toast');
  const accessibilityReport = document.getElementById('accessibilityReport');
  const tabBtns = document.querySelectorAll('.tab-btn');

  // State
  let currentPalette = [];
  let lockedSwatches = {}; // index -> hex
  let exportFormat = 'exportCss';

  // Musical interval degree offsets in degrees around the 360 color wheel
  // Assuming 12 chromatic semitones mapped proportionally or classic chord degrees
  const harmonyIntervals = {
    major: [0, 120, 210, 300], // Tonic, Major 3rd, 5th, Octave-ish
    minor: [0, 90, 210, 300],  // Tonic, Minor 3rd, 5th, 7th
    pentatonic: [0, 60, 150, 210, 300],
    seventh: [0, 90, 180, 270],
    augmented: [0, 120, 240],
    diminished: [0, 90, 180, 270],
    cluster: [0, 15, 30, 45, 60]
  };

  const intervalNames = {
    major: ['Tonic', 'Major 3rd', 'Fifth', 'Octave'],
    minor: ['Tonic', 'Minor 3rd', 'Fifth', 'Seventh'],
    pentatonic: ['Root', '2nd Deg', '3rd Deg', '4th Deg', '5th Deg'],
    seventh: ['Root', 'Major 3rd', 'Fifth', 'Dominant 7'],
    augmented: ['Root', 'Major 3rd', 'Sharp 5th'],
    diminished: ['Root', 'Minor 3rd', 'Dim 5th', 'Major 6th'],
    cluster: ['Root', '+15°', '+30°', '+45°', '+60°']
  };

  // Audio context for preview sound
  let audioCtx = null;
  function playTone(freq) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      // Audio not allowed or supported without user gesture
    }
  }

  // Color conversion utilities
  function hexToRgb(hex) {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    const num = parseInt(cleanHex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s /= 100;
    l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: r * 255, g: g * 255, b: b * 255 };
  }

  // WCAG contrast calculation
  function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  function getContrastRatio(rgb1, rgb2) {
    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  }

  // Generate Palette
  function generatePalette() {
    const rootHex = rootColorInput.value;
    const rootRgb = hexToRgb(rootHex);
    const rootHsl = rgbToHsl(rootRgb.r, rootRgb.g, rootRgb.b);
    const mode = harmonyModeSelect.value;
    const brightnessMod = parseInt(brightnessShiftInput.value, 10);

    brightnessValSpan.textContent = (brightnessMod > 0 ? '+' : '') + brightnessMod + '%';

    const offsets = harmonyIntervals[mode] || harmonyIntervals.major;
    const names = intervalNames[mode] || intervalNames.major;

    currentPalette = offsets.map((offset, index) => {
      if (lockedSwatches[index] !== undefined) {
        return lockedSwatches[index];
      }

      const newHue = (rootHsl.h + offset) % 360;
      let newL = Math.max(5, Math.min(95, rootHsl.l + (index * 4) + brightnessMod));
      let newS = Math.max(10, Math.min(100, rootHsl.s + (index % 2 === 0 ? 0 : -10)));

      const rgb = hslToRgb(newHue, newS, newL);
      return rgbToHex(rgb.r, rgb.g, rgb.b);
    });

    renderPalette(names);
    updateCssOutput();
    updateAccessibilityReport();
  }

  function renderPalette(names) {
    if (!paletteDisplay) return;
    paletteDisplay.innerHTML = '';

    currentPalette.forEach((hex, index) => {
      const swatch = document.createElement('div');
      swatch.className = 'swatch';

      const isLocked = lockedSwatches[index] !== undefined;

      swatch.innerHTML = `
        <div class="swatch-color" style="background-color: ${hex};" data-index="${index}" title="Click to preview sound">
          <button class="lock-btn ${isLocked ? 'locked' : ''}" data-lock-index="${index}" title="${isLocked ? 'Unlock swatch' : 'Lock swatch'}">
            ${isLocked ? '🔒' : '🔓'}
          </button>
        </div>
        <div class="swatch-info">
          <span class="swatch-role">${names[index] || 'Color ' + (index + 1)}</span>
          <button class="swatch-hex" data-copy-hex="${hex}" title="Click to copy hex">${hex}</button>
        </div>
      `;

      paletteDisplay.appendChild(swatch);
    });
  }

  function updateCssOutput() {
    if (!cssCodeOutput) return;
    let css = ':root {
';
    currentPalette.forEach((hex, idx) => {
      css += `  --color-${idx + 1}: ${hex};
`;
    });
    css += '}';
    cssCodeOutput.textContent = css;
  }

  function updateAccessibilityReport() {
    if (!accessibilityReport) return;
    let html = '<h3>WCAG Contrast Report</h3>';
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };

    currentPalette.forEach((hex, idx) => {
      const rgb = hexToRgb(hex);
      const cWhite = getContrastRatio(rgb, white).toFixed(1);
      const cBlack = getContrastRatio(rgb, black).toFixed(1);
      const bestText = cWhite >= 4.5 ? '#ffffff' : (cBlack >= 4.5 ? '#000000' : (cWhite > cBlack ? '#ffffff' : '#000000'));
      const bestRatio = Math.max(cWhite, cBlack);
      const pass = bestRatio >= 4.5 ? '✓ Pass (AA)' : (bestRatio >= 3 ? '⚠ Large Text' : '✕ Fail');

      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; margin-top: 0.35rem;">
          <span style="display: flex; align-items: center; gap: 0.5rem;"><span style="width: 12px; height: 12px; border-radius: 50%; background: ${hex}; display: inline-block;"></span> ${hex}</span>
          <span>Ratio: ${bestRatio} &mdash; <strong>${pass}</strong></span>
        </div>
      `;
    });

    accessibilityReport.innerHTML = html;
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  function prepareExportContent() {
    if (!exportTextarea) return;
    if (exportFormat === 'exportCss') {
      let text = ':root {
';
      currentPalette.forEach((hex, idx) => {
        text += `  --chroma-${idx + 1}: ${hex};
`;
      });
      text += '}';
      exportTextarea.value = text;
    } else if (exportFormat === 'exportJson') {
      const obj = {};
      currentPalette.forEach((hex, idx) => {
        obj[`color_${idx + 1}`] = hex;
      });
      exportTextarea.value = JSON.stringify(obj, null, 2);
    } else if (exportFormat === 'exportTailwind') {
      const obj = {};
      currentPalette.forEach((hex, idx) => {
        obj[`harmony-${idx + 1}`] = hex;
      });
      exportTextarea.value = '// tailwind.config.js
colors: ' + JSON.stringify(obj, null, 2);
    }
  }

  // Event Listeners
  if (rootColorInput && rootColorText) {
    rootColorInput.addEventListener('input', (e) => {
      rootColorText.value = e.target.value;
      generatePalette();
    });

    rootColorText.addEventListener('input', (e) => {
      const val = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        rootColorInput.value = val;
        generatePalette();
      }
    });
  }

  if (harmonyModeSelect) {
    harmonyModeSelect.addEventListener('change', generatePalette);
  }

  if (brightnessShiftInput) {
    brightnessShiftInput.addEventListener('input', generatePalette);
  }

  if (btnRandomize) {
    btnRandomize.addEventListener('click', () => {
      const randomHex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
      rootColorInput.value = randomHex;
      rootColorText.value = randomHex;
      generatePalette();
    });
  }

  if (paletteDisplay) {
    paletteDisplay.addEventListener('click', (e) => {
      const lockBtn = e.target.closest('.lock-btn');
      if (lockBtn) {
        const idx = lockBtn.getAttribute('data-lock-index');
        if (lockedSwatches[idx] !== undefined) {
          delete lockedSwatches[idx];
        } else {
          lockedSwatches[idx] = currentPalette[idx];
        }
        generatePalette();
        return;
      }

      const copyHexBtn = e.target.closest('.swatch-hex');
      if (copyHexBtn) {
        const hex = copyHexBtn.getAttribute('data-copy-hex');
        navigator.clipboard.writeText(hex).then(() => {
          showToast(`Copied ${hex} to clipboard!`);
        });
        return;
      }

      const colorBox = e.target.closest('.swatch-color');
      if (colorBox) {
        const idx = colorBox.getAttribute('data-index');
        // Play a pitch scaled by palette index
        const baseFreq = 220;
        const multiplier = Math.pow(2, idx / 12);
        playTone(baseFreq * multiplier);
      }
    });
  }

  if (btnCopyCss) {
    btnCopyCss.addEventListener('click', () => {
      navigator.clipboard.writeText(cssCodeOutput.textContent).then(() => {
        showToast('CSS variables copied to clipboard!');
      });
    });
  }

  if (btnExport && exportModal) {
    btnExport.addEventListener('click', () => {
      prepareExportContent();
      exportModal.classList.add('open');
      exportModal.setAttribute('aria-hidden', 'false');
    });
  }

  if (btnCloseModal && exportModal) {
    btnCloseModal.addEventListener('click', () => {
      exportModal.classList.remove('open');
      exportModal.setAttribute('aria-hidden', 'true');
    });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      exportFormat = e.target.getAttribute('data-target');
      prepareExportContent();
    });
  };

  if (btnCopyModal && exportTextarea) {
    btnCopyModal.addEventListener('click', () => {
      navigator.clipboard.writeText(exportTextarea.value).then(() => {
        showToast('Export code copied successfully!');
      });
    });
  }

  // Initial render
  generatePalette();
})();
