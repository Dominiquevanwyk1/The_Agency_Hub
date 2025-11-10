const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
{
casting: { type: mongoose.Schema.Types.ObjectId, ref: 'Casting', required: true },
model: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
date: { type: Date },
status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
},
{ timestamps: true }
);

module.exports = mongoose.model('Booking', BookingSchema);