const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
cloud_name: process.env.CLD_CLOUD_NAME,
api_key: process.env.CLD_API_KEY,
api_secret: process.env.CLD_API_SECRET
});

const storage = new CloudinaryStorage({
cloudinary,
params: async (req, file) => ({
folder: 'versatile-visions/portfolio',
resource_type: 'image',
format: 'jpg',
transformation: [{ width: 1600, height: 1600, crop: 'limit' }]
})
});

module.exports = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB