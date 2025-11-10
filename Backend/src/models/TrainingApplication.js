const mongoose = require('mongoose');

const TrainingApplicationSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email:    { type: String, required: true, trim: true, lowercase: true },
  phone:    { type: String },
  preferredCourse: { type: String },
  experience: { type: String },
  notes: { type: String },
  status: { type: String, enum: ['new', 'reviewed', 'contacted'], default: 'new' },
}, { timestamps: true });

module.exports = mongoose.model('TrainingApplication', TrainingApplicationSchema);
