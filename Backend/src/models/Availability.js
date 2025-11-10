const mongoose3 = require('mongoose');

const AvailabilitySchema = new mongoose3.Schema({
model: { type: mongoose3.Schema.Types.ObjectId, ref: 'User', required: true },
date: { type: Date, required: true },
available: { type: Boolean, default: true }
});

module.exports = mongoose3.model('Availability', AvailabilitySchema);