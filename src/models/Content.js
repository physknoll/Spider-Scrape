import mongoose from 'mongoose';

const ContentSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  markdownContent: String,
  metadata: {
    crawlDate: { type: Date, default: Date.now },
    rawResponse: String
  }
});

export const Content = mongoose.model('Content', ContentSchema);
