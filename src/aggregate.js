import 'dotenv/config';
import fs from 'fs';
import { connectDatabase } from './config/database.js';
import { Content } from './models/Content.js';
import logger from './config/logger.js';

async function aggregateContent() {
  await connectDatabase();

  try {
    // Fetch all documents
    const allContent = await Content.find({});

    if (!allContent.length) {
      logger.warn('No documents found in the contents collection.');
      process.exit(0);
    }

    // Combine all markdown fields
    let combinedMarkdown = '';
    for (const doc of allContent) {
      combinedMarkdown += `# URL: ${doc.url}\n\n`;
      combinedMarkdown += doc.markdownContent + '\n\n---\n\n';
    }

    // Write to a .txt or .md file
    fs.writeFileSync('combined.md', combinedMarkdown, 'utf8');
    logger.info('Combined markdown content written to combined.md');
    
  } catch (error) {
    logger.error(`Failed to aggregate content: ${error}`);
  } finally {
    process.exit(0);
  }
}

aggregateContent();
