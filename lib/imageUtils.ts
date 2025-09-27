/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// --- TYPE DEFINITIONS ---
interface PreparedImage {
    preparedDataUrl: string;
    originalWidth: number;
    originalHeight: number;
}

// --- HELPER FUNCTIONS ---
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error(`Failed to load image: ${src.substring(0, 50)}...`));
        img.src = src;
    });
}

/**
 * Converts a data URL string into a Blob object.
 * @param dataUrl The data URL to convert.
 * @returns A Blob object representing the image data.
 */
export function dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error('Invalid data URL');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error('Could not find MIME type in data URL');
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

/**
 * Resizes an image to a maximum dimension while preserving its aspect ratio.
 * @param imageDataUrl The data URL of the source image.
 * @param size The target maximum size for the longest dimension (e.g., 1024).
 * @returns A promise that resolves to an object containing the new data URL and original dimensions.
 */
export async function prepareImage(imageDataUrl: string, size: number = 1024): Promise<PreparedImage> {
    const img = await loadImage(imageDataUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    const { naturalWidth, naturalHeight } = img;
    let width = naturalWidth;
    let height = naturalHeight;

    if (width > height) {
        if (width > size) {
            height = Math.round((size / width) * height);
            width = size;
        }
    } else {
        if (height > size) {
            width = Math.round((size / height) * width);
            height = size;
        }
    }

    canvas.width = width;
    canvas.height = height;
    
    ctx.drawImage(img, 0, 0, width, height);

    return {
        preparedDataUrl: canvas.toDataURL('image/png'),
        originalWidth: naturalWidth,
        originalHeight: naturalHeight,
    };
}

/**
 * Crops a square image back to its original aspect ratio.
 * @param squareImageDataUrl The data URL of the square, AI-generated image.
 * @param originalWidth The width of the original user-uploaded image.
 * @param originalHeight The height of the original user-uploaded image.
 * @returns A promise that resolves to the cropped image data URL.
 */
export async function cropImage(squareImageDataUrl: string, originalWidth: number, originalHeight: number): Promise<string> {
    const img = await loadImage(squareImageDataUrl);
    const originalAspectRatio = originalWidth / originalHeight;
    
    let sx, sy, sWidth, sHeight;
    
    if (originalAspectRatio > 1) { // Landscape
        sWidth = img.naturalWidth;
        sHeight = img.naturalWidth / originalAspectRatio;
        sx = 0;
        sy = (img.naturalHeight - sHeight) / 2;
    } else { // Portrait or square
        sHeight = img.naturalHeight;
        sWidth = img.naturalHeight * originalAspectRatio;
        sy = 0;
        sx = (img.naturalWidth - sWidth) / 2;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = sWidth;
    canvas.height = sHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

    // Always return high-quality PNG.
    return canvas.toDataURL('image/png');
}