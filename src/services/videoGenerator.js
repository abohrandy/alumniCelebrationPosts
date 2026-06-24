const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Automatically generates an 8-10 second portrait video (1080x1920) 
 * from an image with a smooth slow zoom animation using FFmpeg.
 * 
 * @param {string} relativeImagePath - e.g. 'uploads/birthdays/image.jpg'
 * @returns {Promise<string>} - The relative path to the generated MP4 file, e.g. 'uploads/reels/image.mp4'
 */
function generateReel(relativeImagePath) {
    return new Promise((resolve, reject) => {
        if (!relativeImagePath) {
            return reject(new Error('No image path provided.'));
        }

        const dataDir = process.env.DATA_DIR || '';
        const inputPath = path.resolve(dataDir, relativeImagePath);

        if (!fs.existsSync(inputPath)) {
            return reject(new Error(`Input image does not exist: ${inputPath}`));
        }

        const ext = path.extname(relativeImagePath);
        const baseName = path.basename(relativeImagePath, ext);
        
        // Output directory is always uploads/reels
        const relativeOutputDir = 'uploads/reels';
        const absoluteOutputDir = path.resolve(dataDir, relativeOutputDir);
        
        if (!fs.existsSync(absoluteOutputDir)) {
            fs.mkdirSync(absoluteOutputDir, { recursive: true });
        }

        const relativeOutputPath = `${relativeOutputDir}/${baseName}.mp4`;
        const absoluteOutputPath = path.resolve(dataDir, relativeOutputPath);

        // FFmpeg zoompan filter settings:
        // - We scale to 2160x3840 first to give zoompan extra resolution for smooth rendering without pixelation.
        // - d=225 frames (at 25 fps, this is exactly 9 seconds).
        // - z='zoom+0.0005' gives a slow, cinematic zoom.
        // - s=1080x1920 sets the output video resolution.
        // - pix_fmt yuv420p ensures compatibility with standard web/mobile players and platforms.
        const ffmpegCmd = `ffmpeg -loop 1 -i "${inputPath}" -vf "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='zoom+0.0005':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=225:s=1080x1920" -c:v libx264 -t 9 -pix_fmt yuv420p -y "${absoluteOutputPath}"`;

        console.log(`[ReelGen] Generating video for ${relativeImagePath}...`);
        exec(ffmpegCmd, (error, stdout, stderr) => {
            if (error) {
                console.error('[ReelGen] FFmpeg Error:', error.message);
                console.error('[ReelGen] FFmpeg Stderr:', stderr);
                return reject(error);
            }
            console.log(`[ReelGen] Successfully generated reel at ${relativeOutputPath}`);
            resolve(relativeOutputPath);
        });
    });
}

module.exports = { generateReel };
