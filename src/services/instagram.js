const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

/**
 * Uploads a local image to ImgBB and returns the public URL.
 * @param {string} imagePath - Absolute path to the local image.
 * @param {string} apiKey - ImgBB API Key.
 * @returns {Promise<string>} - Public URL of the uploaded image.
 */
async function uploadToImgBB(imagePath, apiKey) {
    if (!apiKey) throw new Error('ImgBB API Key is missing');

    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath));

    const response = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, form, {
        headers: form.getHeaders()
    });

    if (response.data && response.data.data && response.data.data.url) {
        return response.data.data.url;
    } else {
        throw new Error('Failed to upload image to ImgBB');
    }
}

/**
 * Posts an image to Instagram using the Graph API.
 * @param {string} imageUrl - Public URL of the image.
 * @param {string} caption - Post caption.
 * @param {string} businessId - Instagram Business Account ID.
 * @param {string} accessToken - Instagram User Access Token.
 * @returns {Promise<string>} - Instagram Post ID.
 */
async function postToInstagram(imageUrl, caption, businessId, accessToken) {
    if (!businessId || !accessToken) throw new Error('Instagram credentials missing');

    // 1. Create a media container
    const containerResponse = await axios.post(
        `https://graph.facebook.com/v19.0/${businessId}/media`,
        null,
        {
            params: {
                image_url: imageUrl,
                caption: caption,
                access_token: accessToken
            }
        }
    );

    const creationId = containerResponse.data.id;
    if (!creationId) throw new Error('Failed to create Instagram media container');

    // 2. Wait for the container to be ready (usually instant, but wait a bit to be safe if needed)
    // For now, we'll try to publish immediately. If it fails, we might need a status check loop.

    // 3. Publish the media container
    const publishResponse = await axios.post(
        `https://graph.facebook.com/v19.0/${businessId}/media_publish`,
        null,
        {
            params: {
                creation_id: creationId,
                access_token: accessToken
            }
        }
    );

    return publishResponse.data.id;
}

module.exports = {
    uploadToImgBB,
    postToInstagram
};
