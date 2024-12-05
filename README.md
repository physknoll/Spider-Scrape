```markdown
# 🕷️ Spider Markdown Crawler

## 🌐 Overview
This Node.js service crawls websites using the [Spider Cloud JavaScript SDK](https://spider.cloud/) and stores the results in MongoDB Atlas. It converts the scraped HTML into Markdown and saves all pages from a given domain into a single document within a dedicated MongoDB collection named after that domain.

**Key Features**:
- 🌱 Dynamically creates a new MongoDB collection per domain (e.g., `crawl_www_example_com`)
- ✨ Converts HTML to Markdown using Spider API’s `return_format: markdown`
- 🗄 Stores a single combined Markdown file per domain
- 📜 Maintains a `crawl_status` collection for real-time status checks (e.g., `in-progress`, `complete`)
- 🔑 Integration-ready for production environments (run multiple crawls for hundreds/thousands of domains)

## 🛠 Prerequisites
- **Node.js** (v16+ recommended)
- **NPM or Yarn**
- **MongoDB Atlas** account
- **Spider API Key** (obtain from [spider.cloud](https://spider.cloud/))

## ⚙️ Environment Setup
1. **Install Dependencies**:
   ```bash
   npm install
   ```
   
2. **Configure Environment Variables**:
   Create a `.env` file in the project root:
   ```plaintext
   SPIDER_API_KEY=your_spider_api_key
   MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/spider_crawls?retryWrites=true&w=majority
   LOG_LEVEL=info
   ```
   
   **Note:** Replace `<username>`, `<password>` and `<cluster>` with your MongoDB Atlas credentials. Also, `spider_crawls` is your chosen database name.

## 🏗 How It Works
1. **Run the Crawler**:
   ```bash
   node src/crawler.js https://www.example.com
   ```
   
   - The script connects to MongoDB.
   - Instantiates the Spider SDK with your `SPIDER_API_KEY`.
   - Crawls `https://www.example.com`, retrieves pages in Markdown.
   - Combines all pages’ Markdown into a single document.
   - Stores it under a dynamically named collection: `crawl_www_example_com`.
   - Updates `crawl_status` collection to track progress (`in-progress` → `complete`).

2. **Status and Collections**:
   - **`crawl_status`** Collection:  
     Stores documents with fields like `domain`, `status`, `startTime`, `endTime`, `pagesCrawled`.
     
     Example document:
     ```json
     {
       "domain": "www.example.com",
       "status": "complete",
       "startTime": "2024-12-05T22:17:09.000Z",
       "endTime": "2024-12-05T22:20:00.000Z",
       "pagesCrawled": 10
     }
     ```

   - **Domain-Specific Collection**:  
     For `https://www.example.com`, a collection named `crawl_www_example_com` is created.
     
     Example document:
     ```json
     {
       "url": "https://www.example.com",
       "combinedMarkdown": "# URL: https://www.example.com\n\nSome markdown content...\n\n---\n\n# URL: https://www.example.com/page2\n\nMore markdown...",
       "metadata": {
         "startTime": "2024-12-05T22:17:09.000Z",
         "endTime": "2024-12-05T22:20:00.000Z",
         "status": "complete",
         "pagesCrawled": 10
       }
     }
     ```

## 🔍 Querying the Results
**Check Crawl Status**:
```javascript
// Within another Node.js application
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI);

const StatusModel = mongoose.model('crawl_status', new mongoose.Schema({}, { strict: false, collection: 'crawl_status' }));
const statusDoc = await StatusModel.findOne({ domain: 'www.example.com' });
console.log('Crawl Status:', statusDoc.status); // "complete"
```

**Retrieve Combined Markdown** (once status is "complete"):
```javascript
const CrawlModel = mongoose.model('crawl_www_example_com', new mongoose.Schema({}, { strict: false, collection: 'crawl_www_example_com' }));
const crawlDoc = await CrawlModel.findOne({ url: 'https://www.example.com' });
console.log('Combined Markdown:', crawlDoc.combinedMarkdown);
```

## 🏭 Production Considerations
- **Multiple Crawls**: Run `node src/crawler.js <url>` for each new domain. Each domain gets its own collection.
- **Error Handling**: The crawler sets `status: "error"` if something fails.
- **Overwrite Behavior**: If the collection already exists, the script currently overwrites data. Adjust the code if you prefer to abort or version the data.
- **Performance**: Adjust `limit` and other `params` in `crawler.js` to control how many pages you scrape.

## 🚀 Example Workflow
1. Set `MONGO_URI` and `SPIDER_API_KEY`.
2. Run:
   ```bash
   node src/crawler.js https://www.cognitivetalentsolutions.com/
   ```
3. Wait until it logs "Stored combined markdown content...".
4. Query `crawl_status` to confirm `status: "complete"`.
5. Fetch from `crawl_www_cognitivetalentsolutions_com` to view the combined markdown.

## 🎉 Conclusion
You now have a scalable, production-friendly web crawling system:
- Input: Any domain URL
- Output: A single combined Markdown document in a dedicated MongoDB collection
- Status Tracking: Real-time queryable updates in `crawl_status`
- Fully customizable to integrate into larger workflows

Happy Crawling! 🕷🚀
```