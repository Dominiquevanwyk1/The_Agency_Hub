const express3 = require('express');
const Availability = require('../models/Availability');
const router3 = express3.Router();

// Get model availability
router3.get('/:modelId', async (req, res) => {
try {
const data = await Availability.find({ model: req.params.modelId });
res.json(data);
} catch (err) {
res.status(500).json({ error: 'Error fetching availability' });
}
});

// Update availability
router3.post('/', async (req, res) => {
try {
const { model, date, available } = req.body;
if (!model || !date) return res.status(400).json({ error: 'Missing required fields' });

const record = await Availability.findOneAndUpdate(
{ model, date },
{ available },
{ new: true, upsert: true }
);

res.json(record);
} catch (err) {
res.status(500).json({ error: 'Error updating availability' });
}
});

module.exports = router3;