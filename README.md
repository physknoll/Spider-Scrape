```markdown
# 🕷️ Spider Markdown Crawler with Enhanced Filtering and Summarization

## 📋 Overview
This Node.js service crawls a specified website using the [Spider Cloud JavaScript SDK](https://spider.cloud/), extracts text as Markdown, then aggressively cleans and filters the content to ensure only the most relevant information remains. If the content is still large, it uses a two-step approach with OpenAI's APIs to summarize and then analyze the data.

Once processed, the results (including a dense business overview, an ideal customer profile, and suggested categories) are stored in MongoDB Atlas. This ensures that even if the OpenAI analysis fails or the content is too large, you’ll still have at least the cleaned/truncated version of the data stored.

## ✨ Key Features
- **Web Crawling via Spider Cloud SDK**: Automatically scrape multiple pages from a domain.
- **Aggressive Content Cleaning**:
  - Removes images, extraneous URLs, navigation-like text, short lines, and low-value content.
  - Ensures that only lines with substantial alphabetic characters and meaningful words remain.
- **Content Truncation & Summarization**:
  - If content is still too large, it truncates and summarizes the data using a chosen OpenAI model (e.g., `gpt-3.5-turbo-16k`), greatly reducing the context size.
- **OpenAI Analysis**:
  - Generates a **business overview** paragraph.
  - Identifies the **ideal customer profile (ICP)**.
  - Proposes category names as JSON for organizing information in a UI or database.
- **MongoDB Integration**:
  - Stores combined Markdown, summarized content, and analysis results in separate collections per domain.
  - Updates a `crawl_status` collection to reflect crawl progress and completion.
- **Resilient to Failures**:
  - If summarization or analysis fails, the cleaned and truncated data still gets stored in MongoDB.
  - Allows you to inspect and debug without losing data.

## 🚀 Prerequisites
- **Node.js** (v16+ recommended)
- **NPM or Yarn**
- **MongoDB Atlas** account
- **Spider API Key** (from [spider.cloud](https://spider.cloud/))
- **OpenAI API Key** (with access to `gpt-4` and a summarization-capable model like `gpt-3.5-turbo-16k`)

## 🛠 Installation
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/spider-markdown-crawler.git
   cd spider-markdown-crawler
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Environment Variables** in a `.env` file:
   ```plaintext
   SPIDER_API_KEY=your_spider_api_key
   OPENAI_API_KEY=your_openai_api_key
   MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/spider_crawls?retryWrites=true&w=majority
   LOG_LEVEL=info
   ```

## 🏗 How It Works
1. **Crawl the Website**:
   ```bash
   node src/crawler.js https://www.example.com
   ```
   The script:
   - Uses the Spider SDK to crawl `https://www.example.com`.
   - Cleans and filters the retrieved Markdown content aggressively.
   - Truncates the content to avoid extremely large prompts.
   - Stores the cleaned/truncated content in MongoDB immediately so you have data regardless of downstream failures.

2. **Summarization (If Needed)**:
   - If the content is still large after cleaning/truncation, it will attempt a summarization step using a summarization-capable model (`gpt-3.5-turbo-16k`).
   - On successful summarization, it updates the stored content in MongoDB with the summarized text.

3. **OpenAI Analysis**:
   - Once the content is small enough, it sends prompts to `gpt-4` to get:
     - A **business overview** paragraph.
     - An **ideal customer profile (ICP)** paragraph.
     - A set of **categories** in JSON format.

   All these analyses are stored back into MongoDB under the `analysis` field for the crawled domain.

4. **Result**:
   - MongoDB now contains:
     - `crawl_status` collection tracking crawl status.
     - `crawl_<domain>` collection for the given domain, containing:
       - `combinedMarkdown` (cleaned or summarized)
       - `analysis.businessOverview`
       - `analysis.idealCustomerProfile`
       - `analysis.categories` (JSON array)

## 📚 Querying Results
Use the MongoDB Atlas dashboard or a MongoDB client:
```javascript
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGO_URI);
const collectionName = 'crawl_www_example_com'; // for domain: www.example.com
const CrawlModel = mongoose.model(collectionName, new mongoose.Schema({}, { strict: false, collection: collectionName }));
const doc = await CrawlModel.findOne({ url: 'https://www.example.com' });

console.log(doc.combinedMarkdown);
console.log(doc.analysis.businessOverview);
console.log(doc.analysis.idealCustomerProfile);
console.log(doc.analysis.categories);
```

## ⚠️ Error Handling & Limitations
- If the content is too large, the code truncates and summarizes.
- If OpenAI requests fail due to context length or other issues, you still retain data in MongoDB.
- Adjust cleaning heuristics and truncation lengths as needed to accommodate different websites and content sizes.

## 🤝 Contributing
- Fork the repo
- Create a feature branch
- Make changes and commit
- Submit a pull request

## 📜 License
This project is licensed under the MIT License.
```