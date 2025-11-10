const express4 = require('express');
const Booking = require('../models/Booking');
const router4 = express4.Router();

// Get bookings
router4.get('/', async (req, res) => {
try {
const bookings = await Booking.find().populate('model casting');
res.json(bookings);
} catch (err) {
res.status(500).json({ error: 'Error fetching bookings' });
}
});

// Create booking
router4.post('/', async (req, res) => {
try {
const { casting, model, date } = req.body;
if (!casting || !model || !date) return res.status(400).json({ error: 'Missing fields' });

const booking = new Booking({ casting, model, date });
await booking.save();
res.json(booking);
} catch (err) {
res.status(500).json({ error: 'Error creating booking' });
}
});

// Delete booking
router4.delete('/:id', async (req, res) => {
try {
await Booking.findByIdAndDelete(req.params.id);
res.json({ ok: true });
} catch (err) {
res.status(500).json({ error: 'Error deleting booking' });
}
});

module.exports = router4;
