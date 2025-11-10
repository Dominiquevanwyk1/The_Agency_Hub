const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  name: String,
  type: String,
  size: Number,
  url: String,
}, { _id: false });

const MessageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    body: { type: String, default: '' },
    files:{ type: [FileSchema], default: [] },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);
module.exports = mongoose.model("Message", MessageSchema);
