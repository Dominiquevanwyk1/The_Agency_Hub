const router = require('express').Router();
const { auth } = require('../middleware/auth');
const upload = require('../services/cloudinary');

// POST /api/upload/photo - returns Cloudinary URL
router.post('/photo', auth, upload.single('photo'), async (req,res)=>{
res.json({ url: req.file.path }); // Cloudinary returns the URL on file.path
});

module.exports = router;