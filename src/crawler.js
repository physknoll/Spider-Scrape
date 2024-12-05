import 'dotenv/config';
import { Spider } from '@spider-cloud/spider-client';
import mongoose from 'mongoose';
import logger from './config/logger.js';
import { connectDatabase } from './config/database.js';
import fs from 'fs';
import { URL } from 'url';

async function crawl() {
  await connectDatabase();

  const urlToCrawl = process.argv[2];
  if (!urlToCrawl) {
    logger.error('Please provide a URL as a parameter. For example: node src/crawler.js https://www.example.com');
    process.exit(1);
  }

  // Parse domain from URL
  const domain = new URL(urlToCrawl).hostname;
  const collectionName = `crawl_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;

  // Check if collection already exists (listCollections is a native MongoDB call)
  const collections = await mongoose.connection.db.listCollections().toArray();
  const collectionExists = collections.some((col) => col.name === collectionName);

  if (collectionExists) {
    // Decide behavior: error out or overwrite
    logger.warn(`Collection "${collectionName}" already exists. Overwriting data.`);
    // If you don't want to overwrite, uncomment the next line and comment out the overwrite logic.
    // process.exit(1);
  }

  // Create a Mongoose model dynamically using the domain-based collection name
  // We'll store one document per crawl
  const CrawlSchema = new mongoose.Schema({
    url: String,
    combinedMarkdown: String,
    metadata: {
      startTime: Date,
      endTime: Date,
      status: String,
      pagesCrawled: Number
    }
  }, { collection: collectionName });

  const CrawlModel = mongoose.model(collectionName, CrawlSchema);

  // Update status in a separate collection
  const StatusSchema = new mongoose.Schema({
    domain: { type: String, unique: true },
    status: String, // "pending", "in-progress", "complete", "error"
    startTime: Date,
    endTime: Date,
    pagesCrawled: Number
  }, { collection: 'crawl_status' });

  const StatusModel = mongoose.model('crawl_status', StatusSchema);

  // Initialize Spider client
  const spiderClient = new Spider({ apiKey: process.env.SPIDER_API_KEY });

  logger.info(`Starting crawl for: ${urlToCrawl}`);

  // Insert a "pending" status
  await StatusModel.findOneAndUpdate(
    { domain },
    { domain, status: 'in-progress', startTime: new Date(), pagesCrawled: 0 },
    { upsert: true }
  );

  const params = {
    return_format: 'markdown',
    limit: 25,
    metadata: true,
    cache: false
  };

  try {
    const spiderData = await spiderClient.crawlUrl(urlToCrawl, params);

    logger.info('Received response from Spider API.');
    logger.verbose(`Full Spider API Response: ${JSON.stringify(spiderData, null, 2)}`);

    if (Array.isArray(spiderData) && spiderData.length > 0) {
      // Combine all content into a single markdown string
      let combinedMarkdown = '';
      spiderData.forEach((page, index) => {
        combinedMarkdown += `# URL: ${page.url}\n\n${page.content}\n\n---\n\n`;
      });

      // Store single doc with combined markdown
      await CrawlModel.findOneAndUpdate(
        { url: urlToCrawl },
        {
          url: urlToCrawl,
          combinedMarkdown,
          metadata: {
            startTime: (await StatusModel.findOne({ domain })).startTime,
            endTime: new Date(),
            status: 'complete',
            pagesCrawled: spiderData.length
          }
        },
        { upsert: true, new: true }
      );

      // Update status
      await StatusModel.findOneAndUpdate(
        { domain },
        { status: 'complete', endTime: new Date(), pagesCrawled: spiderData.length }
      );

      logger.info(`Stored combined markdown content for domain: ${domain}`);
    } else {
      logger.warn('No content returned from Spider API. Updating status to error.');
      await StatusModel.findOneAndUpdate(
        { domain },
        { status: 'error', endTime: new Date() }
      );
    }
  } catch (error) {
    logger.error(`Crawl failed: ${error}`);
    await StatusModel.findOneAndUpdate(
      { domain },
      { status: 'error', endTime: new Date() }
    );
  } finally {
    process.exit(0);
  }
}

crawl();
