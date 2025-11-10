const router=require('express').Router();
const { auth, requireRole }=require('../middleware/auth');
const User=require('../models/User');

// GET /api/models - admin only
router.get('/', auth, requireRole('admin'), async (req,res)=>{
const models = await User.find({ role:'model' }).select('_id name email role height bio disabled');
res.json(models);
});

// POST /api/models/profile - model updates own profile
router.post('/profile', auth, async (req,res)=>{
if(req.user.role!=='model') return res.status(403).json({message:'Only models can edit'});
await User.findByIdAndUpdate(req.user.id,{ height:req.body.height, bio:req.body.bio });
res.json({message:'Saved'});
});

// PATCH disable
router.patch('/:id/disable', auth, requireRole('admin'), async (req,res)=>{
await User.findByIdAndUpdate(req.params.id,{ disabled:true });
res.json({message:'Disabled'});
});

// DELETE model
router.delete('/:id', auth, requireRole('admin'), async (req,res)=>{
await User.findByIdAndDelete(req.params.id);
res.json({message:'Deleted'});
});

module.exports=router;