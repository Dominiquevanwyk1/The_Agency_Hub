const mongoose = require("mongoose");
const { Schema } = mongoose;

const ApplicationSchema = new Schema(
  {
    casting: { type: Schema.Types.ObjectId, ref: "Casting", required: true, index: true },
    model:   { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    note:    { type: String },
    status:  { 
      type: String, 
      enum: ["pending", "reviewed", "shortlisted", "accepted", "rejected"], 
      default: "pending",
      index: true
    },
  },
  { timestamps: true }
);

ApplicationSchema.index({ casting: 1, model: 1 }, { unique: true });

module.exports = mongoose.model("Application", ApplicationSchema);
