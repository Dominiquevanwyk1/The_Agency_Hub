const mongoose = require('mongoose');

const CastingSchema = new mongoose.Schema(
  {
  title: { type: String, required: true },
  description: { type: String, trim: true },
  location: { type: String },
  pay: { type: String },
  requirements: { type: String, trim: true },
  closesAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['open', 'archived', 'closed'], default: 'open' },
  archivedAt: { type: Date },
  },
  { timestamps: true }
  );
  
  module.exports = mongoose.model('Casting', CastingSchema);
