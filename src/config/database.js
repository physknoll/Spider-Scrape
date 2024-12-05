// src/config/database.js
import mongoose from 'mongoose';
import logger from './logger.js';

export const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    logger.info('Connected to MongoDB Atlas successfully.');
  } catch (error) {
    logger.error('MongoDB connection error: ' + error);
    process.exit(1);
  }
};
