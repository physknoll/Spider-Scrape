import 'dotenv/config';
import http from 'http';
import { connectDatabase } from '../src/config/database.js';
import { Content } from '../src/models/Content.js';
import logger from '../src/config/logger.js';

async function runTests() {
  logger.info('Running tests...');

  // Test database connection
  await connectDatabase();
  logger.info('Database connection test passed.');

  // Test Spider API by making a small request
  const spiderResult = await testSpiderAPI();
  if (!spiderResult) {
    logger.error('Spider API test failed.');
    process.exit(1);
  }
  logger.info('Spider API test passed.');

  // Test database insert and query
  const testUrl = 'https://test.example.com';
  await Content.findOneAndUpdate(
    { url: testUrl },
    { markdownContent: '# Test Markdown', metadata: { crawlDate: new Date() } },
    { upsert: true, new: true }
  );

  const doc = await Content.findOne({ url: testUrl });
  if (doc && doc.markdownContent === '# Test Markdown') {
    logger.info('Database insert/retrieve test passed.');
  } else {
    logger.error('Database insert/retrieve test failed.');
    process.exit(1);
  }

  logger.info('All tests passed successfully!');
  process.exit(0);
}

function testSpiderAPI() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.spider.cloud',
      port: 80,
      path: '/crawl',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SPIDER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const postData = JSON.stringify({
      "return_format": "markdown",
      "data": [{
        "html": "<html><body><h1>Test</h1><p>Sample content</p></body></html>",
        "url": "https://example.com"
      }]
    });

    const req = http.request(options, (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          const jsonResponse = JSON.parse(body);
          // We expect markdown in response
          if (jsonResponse.data && jsonResponse.data[0] && jsonResponse.data[0].markdown) {
            resolve(true);
          } else {
            resolve(false);
          }
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      logger.error(`Spider API test request error: ${err}`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

runTests();
