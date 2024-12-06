import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
// If needed on older Node versions, uncomment:
// import fetch from 'node-fetch';
import { Spider } from '@spider-cloud/spider-client';
import logger from './config/logger.js';
import { connectDatabase } from './config/database.js';

async function crawlAndAnalyze() {
  await connectDatabase();

  const urlToCrawl = process.argv[2];
  if (!urlToCrawl) {
    logger.error('Please provide a URL as a parameter. Example: node src/crawler.js https://www.example.com');
    process.exit(1);
  }

  const domain = new URL(urlToCrawl).hostname;
  const collectionName = `crawl_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const StatusSchema = new mongoose.Schema({}, { strict: false, collection: 'crawl_status' });
  const StatusModel = mongoose.model('crawl_status', StatusSchema);

  const CrawlSchema = new mongoose.Schema({}, { strict: false, collection: collectionName });
  const CrawlModel = mongoose.model(collectionName, CrawlSchema);

  const spiderClient = new Spider({ apiKey: process.env.SPIDER_API_KEY });
  
  logger.info(`Starting crawl for: ${urlToCrawl}`);

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

    if (!Array.isArray(spiderData) || spiderData.length === 0) {
      logger.warn('No content returned from Spider API. Updating status to error.');
      await StatusModel.findOneAndUpdate({ domain }, { status: 'error', endTime: new Date() });
      process.exit(0);
    }

    // Combine and clean content
    let combinedMarkdown = '';
    spiderData.forEach((page) => {
      combinedMarkdown += `# URL: ${page.url}\n\n${page.content}\n\n---\n\n`;
    });

    combinedMarkdown = cleanContent(combinedMarkdown);

    // More aggressive truncation before anything else
    const MAX_LENGTH = 8000; 
    if (combinedMarkdown.length > MAX_LENGTH) {
      combinedMarkdown = combinedMarkdown.slice(0, MAX_LENGTH);
      logger.info(`Truncated combinedMarkdown to ${MAX_LENGTH} characters.`);
    }

    // Store the combinedMarkdown now, so we have data in DB no matter what
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

    await StatusModel.findOneAndUpdate(
      { domain },
      { status: 'complete', endTime: new Date(), pagesCrawled: spiderData.length }
    );

    logger.info(`Stored combined markdown content for domain: ${domain}`);

    // If still long, attempt summarization before final analysis
    if (combinedMarkdown.length > 5000) {
      logger.info('Content still large, attempting summarization with gpt-3.5-turbo-16k...');
      try {
        const summarized = await summarizeContent(combinedMarkdown, 'gpt-3.5-turbo-16k');
        await CrawlModel.findOneAndUpdate(
          { url: urlToCrawl },
          { $set: { combinedMarkdown: summarized } }
        );
        logger.info('Summarization successful, updated DB with summarized content.');
      } catch (summarizeError) {
        logger.error(`Summarization failed: ${summarizeError}`);
        // We still have truncated data in DB, proceed or exit
        process.exit(0);
      }
    }

    await runAnalysis(domain, CrawlModel, urlToCrawl);

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

async function runAnalysis(domain, CrawlModel, fullUrl) {
  const crawlDoc = await CrawlModel.findOne({ url: fullUrl });
  if (!crawlDoc || !crawlDoc.combinedMarkdown) {
    logger.error(`No combinedMarkdown found for domain: ${domain} during analysis.`);
    return;
  }

  const allContent = crawlDoc.combinedMarkdown;

  const businessOverviewPrompt = `You are an expert business analyst. Based solely on the following information about this company:

${allContent}

Create a single, dense paragraph that summarizes the business. Include:
The business name (if available)
The markets or industries it operates in
The products or services it offers
Its target market and customers
Its value proposition
Its competitive environment or any mention of competitors
Any contact or location details if present
The result should be one comprehensive paragraph with no bullet points, just a flowing descriptive narrative.`;

  const icpPrompt = `You are an expert marketing strategist. Based solely on the following information about this company:

${allContent}

Identify the ideal customer profile (ICP) for this business. Include details on demographics, interests, occupation, industry, and any relevant characteristics that define the customer segment. Present the ICP in one solid, cohesive paragraph, providing a clear and detailed description without bullet points.
`;

  const categoriesPrompt = `You are an expert at organizing information about businesses into categories that prospective customers care about... (omitted for brevity)
${allContent}`;

  try {
    const businessOverview = await callOpenAIAPI(businessOverviewPrompt, "gpt-4");
    const icp = await callOpenAIAPI(icpPrompt, "gpt-4");
    logger.info("Business Overview:\n" + businessOverview);
    logger.info("ICP:\n" + icp);

    const categoriesResponse = await callOpenAIAPI(categoriesPrompt, "gpt-4");
    let categories = [];
    try {
      const parsed = JSON.parse(categoriesResponse);
      if (Array.isArray(parsed.categories)) {
        categories = parsed.categories;
      } else {
        logger.warn('Categories response invalid. Storing empty array.');
      }
    } catch (err) {
      logger.error('Failed to parse categories JSON: ' + err);
    }

    await CrawlModel.findOneAndUpdate(
      { url: fullUrl },
      {
        $set: {
          "analysis.businessOverview": businessOverview,
          "analysis.idealCustomerProfile": icp,
          "analysis.categories": categories
        }
      }
    );

    logger.info('Analysis completed and stored in the database.');
  } catch (analysisError) {
    logger.error(`Analysis failed: ${analysisError}`);
  }
}

async function callOpenAIAPI(prompt, model = "gpt-4") {
  const openAIEndpoint = 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(openAIEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API request failed: ${errorText}`);
  }

  const responseData = await response.json();
  return responseData.choices[0].message.content.trim();
}

function cleanContent(markdown) {
  const socialMediaDomains = ['linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'youtube.com'];
  const urlRegex = /\bhttps?:\/\/[^\s]+/gi;
  const imagePatterns = [
    /!\[.*?\]\(.*?\)/g,
    /<img[^>]*>/gi,
    /\bhttps?:\/\/[^\s]+\.(jpg|jpeg|png|gif)/gi
  ];

  const lines = markdown.split('\n');
  const seenLines = new Set();

  const cleanedLines = lines.map(line => {
    let newLine = line;
    for (const pattern of imagePatterns) {
      newLine = newLine.replace(pattern, '');
    }

    // Remove non-whitelisted URLs
    newLine = newLine.replace(urlRegex, (url) => {
      if (socialMediaDomains.some(domain => url.includes(domain))) {
        return url; 
      }
      return ''; // remove other URLs
    });

    newLine = newLine.trim();
    return newLine;
  })
  .filter(line => {
    if (!line) return false;

    // Must contain letters
    if (!/[a-zA-Z]/.test(line)) return false;

    // Check for enough substantive words
    const words = line.split(/\s+/).filter(w => w.length > 0);
    const longWords = words.filter(w => w.length > 3);
    if (longWords.length < 2) return false; // needs at least two words longer than 3 chars

    // Check for too many special chars / numeric
    const alphaChars = line.replace(/[^a-zA-Z]/g, '').length;
    const totalChars = line.length;
    if (alphaChars / totalChars < 0.5) {
      // Less than half chars are alphabetic, likely junk line
      return false;
    }

    // Remove duplicates or very similar lines
    const lowerLine = line.toLowerCase();
    if (seenLines.has(lowerLine)) return false;
    seenLines.add(lowerLine);

    return true;
  });

  return cleanedLines.join('\n');
}

async function summarizeContent(content, model = "gpt-3.5-turbo-16k") {
  const summarizePrompt = `This text is very long. Summarize all the essential information about the business into a much shorter text, focusing on what the business is, what it offers, its industry, and any crucial details that help identify it. Do not omit important details, but present them concisely. Avoid unnecessary repetition.
  
${content}`;

  return await callOpenAIAPI(summarizePrompt, model);
}

crawlAndAnalyze();
